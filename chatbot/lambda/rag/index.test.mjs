// Unit tests for the RAG handler. Uses Node's built-in test runner and mocks the
// AWS SDK clients so no network/credentials are needed.
//
// Run: node --test   (from chatbot/lambda/rag)

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.KNOWLEDGE_BASE_ID = 'TESTKB123';
process.env.AWS_REGION = 'ap-southeast-1';

// --- Mock the AWS SDK modules BEFORE importing the handler. ---
import { mock } from 'node:test';

const retrieveResult = {
  retrievalResults: [
    {
      content: { text: 'Miracle offers MiracleConnect and MiracleFlow.' },
      location: { s3Location: { uri: 's3://miracle-kb-data-1/miracle-profile.md' } },
      score: 0.7234,
    },
    {
      content: { text: 'MiracleVault is a secure data exchange.' },
      location: { s3Location: { uri: 's3://miracle-kb-data-1/miracle-profile.md' } },
      score: 0.6611,
    },
  ],
};

const converseResult = {
  output: { message: { content: [{ text: 'Miracle offers several products.' }] } },
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
};

// Intercept the SDK clients via module mocking.
mock.module('@aws-sdk/client-bedrock-agent-runtime', {
  namedExports: {
    BedrockAgentRuntimeClient: class {
      async send() {
        return retrieveResult;
      }
    },
    RetrieveCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  },
});

mock.module('@aws-sdk/client-bedrock-runtime', {
  namedExports: {
    BedrockRuntimeClient: class {
      async send() {
        return converseResult;
      }
    },
    ConverseCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  },
});

const { handler } = await import('./index.mjs');

test('returns answer and full metrics for a valid request', async () => {
  const event = {
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({
      message: 'What products does Miracle offer?',
      modelId: 'apac.amazon.nova-lite-v1:0',
    }),
  };

  const res = await handler(event);
  assert.equal(res.statusCode, 200);

  const payload = JSON.parse(res.body);
  assert.equal(payload.answer, 'Miracle offers several products.');
  assert.equal(payload.modelId, 'apac.amazon.nova-lite-v1:0');
  assert.equal(payload.modelLabel, 'Amazon Nova Lite');
  assert.equal(payload.region, 'ap-southeast-1');

  // usage
  assert.equal(payload.usage.inputTokens, 100);
  assert.equal(payload.usage.outputTokens, 20);
  assert.equal(payload.usage.totalTokens, 120);

  // retrieval
  assert.equal(payload.retrievedChunks, 2);
  assert.equal(payload.retrieval[0].score, 0.7234);
  assert.ok(payload.retrieval[0].uri.includes('miracle-profile.md'));

  // derived metrics present
  assert.ok(typeof payload.latencyMs === 'number');
  assert.ok(typeof payload.tokensPerSecond === 'number');
  assert.ok(typeof payload.estimatedCostUsd === 'number');

  // cost = 100/1000*0.00006 + 20/1000*0.00024 = 0.000006 + 0.0000048 = 0.0000108
  assert.equal(payload.estimatedCostUsd, 0.000011);

  // CORS header
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('rejects an empty message', async () => {
  const res = await handler({ body: JSON.stringify({ modelId: 'apac.amazon.nova-lite-v1:0' }) });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /message/);
});

test('rejects a model not on the allowlist', async () => {
  const res = await handler({
    body: JSON.stringify({ message: 'hi', modelId: 'evil.model:0' }),
  });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body);
  assert.match(payload.error, /Unsupported modelId/);
  assert.ok(Array.isArray(payload.allowedModels));
});

test('handles CORS preflight (OPTIONS)', async () => {
  const res = await handler({ requestContext: { http: { method: 'OPTIONS' } } });
  assert.equal(res.statusCode, 204);
});

test('rejects invalid JSON body', async () => {
  const res = await handler({ body: '{not json' });
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Invalid JSON/);
});
