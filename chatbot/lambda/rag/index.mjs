// Miracle RAG chatbot — manual RAG handler for API Gateway HTTP API (AWS_PROXY).
//
// Flow per request:
//   1. Validate { message, modelId } against a server-side model allowlist.
//   2. Retrieve top-K grounded chunks + similarity scores from the Bedrock KB
//      (S3 Vectors index) via the bedrock-agent-runtime Retrieve API.
//   3. Build a grounded prompt and call Bedrock Runtime Converse with the chosen model.
//   4. Return answer + metrics: token usage, latency, tokens/sec, estimated cost,
//      retrieved chunk count, and top similarity scores.
//
// Env vars:
//   KNOWLEDGE_BASE_ID (required) — the Bedrock KB id.
//   TOP_K             (optional) — number of chunks to retrieve (default 4).
//   ALLOWED_ORIGIN    (optional) — CORS Access-Control-Allow-Origin (default '*').
//
// Region is read from AWS_REGION (set automatically by Lambda).

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const REGION = process.env.AWS_REGION || 'ap-southeast-1';
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const TOP_K = Number.parseInt(process.env.TOP_K || '4', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const agentClient = new BedrockAgentRuntimeClient({ region: REGION });
const runtimeClient = new BedrockRuntimeClient({ region: REGION });

// Server-side allowlist. Keys are the modelId the frontend may request.
// NOTE: In ap-southeast-1, Nova and newer Claude models are invoked via APAC
// cross-region inference profiles. Confirm the exact IDs in the Bedrock console
// (Model catalog / Cross-region inference) and update here + in the IAM policy.
// Serverless models are auto-enabled per Region (no "Model access" page); third-party
// models (Claude, Cohere) auto-subscribe via AWS Marketplace on first invoke, which
// requires aws-marketplace:Subscribe on the Lambda role (granted in deploy-lambda.sh).
// Prices are USD per 1,000 tokens (approximate — update from the Bedrock pricing page).
const MODELS = {
  'apac.amazon.nova-lite-v1:0': {
    label: 'Amazon Nova Lite',
    pricePer1kInput: 0.00006,
    pricePer1kOutput: 0.00024,
  },
  'global.anthropic.claude-haiku-4-5-20251001-v1:0': {
    label: 'Claude Haiku 4.5',
    pricePer1kInput: 0.001,
    pricePer1kOutput: 0.005,
  },
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    label: 'Claude Sonnet 4.5',
    pricePer1kInput: 0.003,
    pricePer1kOutput: 0.015,
  },
};

const DEFAULT_MODEL_ID = 'apac.amazon.nova-lite-v1:0';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  // CORS preflight (HTTP API can also answer this via its own CORS config).
  const method =
    event?.requestContext?.http?.method || event?.httpMethod || 'POST';
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (!KNOWLEDGE_BASE_ID) {
    return respond(500, { error: 'KNOWLEDGE_BASE_ID env var is not set' });
  }

  // Parse body (HTTP API may base64-encode it).
  let body;
  try {
    const raw = event?.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    body = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const message = (body.message || '').trim();
  const modelId = body.modelId || DEFAULT_MODEL_ID;

  if (!message) {
    return respond(400, { error: 'Field "message" is required' });
  }
  const model = MODELS[modelId];
  if (!model) {
    return respond(400, {
      error: `Unsupported modelId "${modelId}"`,
      allowedModels: Object.keys(MODELS),
    });
  }

  const startedAt = Date.now();

  try {
    // 1. Retrieve grounded chunks + similarity scores.
    const retrieveResp = await agentClient.send(
      new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: message },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: TOP_K },
        },
      })
    );

    const results = retrieveResp.retrievalResults || [];
    const retrieval = results.map((r) => ({
      uri: r.location?.s3Location?.uri || r.location?.type || 'unknown',
      score: typeof r.score === 'number' ? Number(r.score.toFixed(4)) : null,
    }));

    const context = results
      .map((r, i) => `[Chunk ${i + 1}]\n${r.content?.text ?? ''}`)
      .join('\n\n');

    // 2. Build the grounded prompt and call Converse with the selected model.
    const systemPrompt =
      'You are the Miracle Technologies assistant. Answer the user question using ' +
      'ONLY the provided context. If the context does not contain the answer, say you ' +
      "don't have that information. Be concise and factual.";

    const userContent =
      `Context:\n${context || '(no relevant context found)'}\n\n` +
      `Question: ${message}`;

    const genStart = Date.now();
    const converseResp = await runtimeClient.send(
      new ConverseCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: [{ text: userContent }] }],
        // Set only ONE of temperature / topP: Claude 4.5 models reject both together.
        inferenceConfig: { maxTokens: 512, temperature: 0.2 },
      })
    );
    const genMs = Date.now() - genStart;

    const answer =
      converseResp.output?.message?.content?.map((c) => c.text).join('') ?? '';

    const usage = converseResp.usage || {};
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

    // 3. Metrics.
    const latencyMs = Date.now() - startedAt;
    const tokensPerSecond =
      genMs > 0 ? Number(((outputTokens / genMs) * 1000).toFixed(1)) : 0;
    const estimatedCostUsd = Number(
      (
        (inputTokens / 1000) * model.pricePer1kInput +
        (outputTokens / 1000) * model.pricePer1kOutput
      ).toFixed(6)
    );

    return respond(200, {
      answer,
      modelId,
      modelLabel: model.label,
      region: REGION,
      usage: { inputTokens, outputTokens, totalTokens },
      latencyMs,
      tokensPerSecond,
      retrieval,
      retrievedChunks: retrieval.length,
      estimatedCostUsd,
    });
  } catch (err) {
    console.error('RAG handler error:', err);
    return respond(500, { error: err.message || 'Internal error' });
  }
};
