# Miracle RAG Chatbot — Deployment Runbook (Singapore)

End-to-end runbook to stand up the Miracle RAG chatbot:

- **Bedrock Knowledge Base + S3 Vectors** → created **manually in the console** (Step 1).
- **IAM role, Lambda, API Gateway (HTTP API)** → created via **AWS CLI** scripts (Steps 2–4).
- **Frontend** → hosted on **S3 static website hosting** (Step 4).

**Region:** `ap-southeast-1` (Singapore). Run every step in this region.

```
Browser ──HTTP──> S3 static website (index.html, app.js, style.css)
Browser ──HTTPS─> API Gateway HTTP API ──> Lambda chatbot-rag
                                            ├─ Retrieve  → Bedrock KB → S3 Vectors
                                            └─ Converse  → Bedrock Runtime (model picked per request)
```

The chatbot uses a **manual RAG flow** (KB `Retrieve` + Bedrock `Converse`), so the KB
only provides retrieval. You do **not** attach a generation model to the KB — the Lambda
picks the chat model per request.

---

## Prerequisites

- AWS CLI v2, configured (`aws configure`) for an IAM user with access to Bedrock, S3,
  IAM, Lambda, and API Gateway in `ap-southeast-1`.
- Node.js 18+ and npm (to install the Lambda's production dependencies locally).
- `jq` (optional, for pretty smoke-test output).
- `zip` on PATH (used by `deploy-lambda.sh`).

Repository layout used by this runbook:

```
.
├── miracle-profile.md                 # RAG source document
├── chatbot/
│   ├── DEPLOYMENT.md                  # this file (full runbook)
│   ├── frontend/{index.html,app.js,style.css}
│   └── lambda/rag/{index.mjs,package.json,index.test.mjs}
└── scripts/{deploy-lambda.sh,deploy-apigw.sh,deploy-frontend.sh}
```

**Models used:**
- Embeddings (KB): `cohere.embed-english-v3` — Titan embeddings are **not available** in
  ap-southeast-1; Cohere Embed English v3 is the best-practice choice there (1024-dim,
  on-demand, same vector shape).
- Chat (per request): Amazon Nova Lite, Claude Haiku 4.5, Claude Sonnet 4.5.

> **Model enablement (Sep 2025+).** Bedrock removed the old **Model access** page.
> Serverless models are **auto-enabled** per Region; access is granted via **IAM**, plus
> an automatic AWS Marketplace subscription on first use of a third-party model (Anthropic
> Claude, Cohere). Amazon Nova needs neither. Details and fixes are inline in Step 1 and
> Troubleshooting.

---

## Step 1 — Create the Knowledge Base + S3 Vectors (console, one time)

Bedrock automatically creates the S3 Vectors bucket and vector index for you.

```
miracle-profile.md ─upload─▶ S3 Data Bucket ─data source─▶ Bedrock Knowledge Base
   ─embeds (Cohere Embed English v3)─▶ S3 Vectors bucket+index ─▶ Retrieve API (used by the Lambda)
```

### 1a. Confirm model availability (no "Model access" step anymore)

1. Open the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock) and set the
   region to **Asia Pacific (Singapore) ap-southeast-1** (top-right region selector).
2. Left nav → **Model catalog**. Confirm these are **Available** in the Region (they are
   enabled automatically — no action needed):
   - **Cohere → Embed English v3** (KB embeddings — `cohere.embed-english-v3`)
   - **Amazon → Nova Lite** (chat)
   - **Anthropic → Claude Haiku 4.5** (chat)
   - **Anthropic → Claude Sonnet 4.5** (chat)
3. Optionally open a model in the **Playground** to smoke-test it.

> **IAM grants access now.** The identity that invokes a model (the KB service role for
> embeddings, and `ChatbotRagRole` for chat) must be allowed to call Bedrock. For
> **third-party** models (Anthropic Claude, Cohere Embed), the role also needs AWS
> Marketplace permissions so Bedrock can auto-subscribe on first use, otherwise you get
> `AccessDeniedException`:
>
> ```json
> {
>   "Version": "2012-10-17",
>   "Statement": [
>     {
>       "Sid": "BedrockMarketplaceSubscribe",
>       "Effect": "Allow",
>       "Action": [
>         "aws-marketplace:Subscribe",
>         "aws-marketplace:ViewSubscriptions",
>         "aws-marketplace:Unsubscribe"
>       ],
>       "Resource": "*"
>     }
>   ]
> }
> ```
>
> `Resource` must be `"*"` — these Marketplace actions are account-level. `deploy-lambda.sh`
> already attaches this to `ChatbotRagRole`. **Amazon Nova needs no Marketplace permissions.**

> **One-time step for Anthropic (Claude).** The first time any identity in the account
> uses a Claude model, submit the **First-Time-Use (FTU)** form once (prompted when you
> open a Claude model in the Model catalog/Playground; CLI: `aws bedrock
> put-use-case-for-model-access`). Nova and Cohere do not require it.

> **Inference profiles (important for Singapore).** Nova and newer Claude models in
> `ap-southeast-1` are usually invoked through **cross-region inference profiles**, not
> plain foundation-model IDs. Note each profile ID from the model's detail page (or the
> **Cross-region inference** tab):
> - `apac.amazon.nova-lite-v1:0`
> - `global.anthropic.claude-haiku-4-5-20251001-v1:0` (Claude Haiku 4.5)
> - `global.anthropic.claude-sonnet-4-5-20250929-v1:0` (Claude Sonnet 4.5)
>
> Note Claude 4.5 models use **global** inference profiles (`global.` prefix), while Nova
> Lite uses an **APAC** profile (`apac.` prefix).
>
> If your IDs differ from the defaults, update the `MODELS` allowlist in
> `chatbot/lambda/rag/index.mjs` and the `<option>` values in
> `chatbot/frontend/index.html` before deploying. The embedding model
> `cohere.embed-english-v3` is on-demand and used as-is (no inference profile).

### 1b. Create the S3 data bucket and upload the document

Standard S3 bucket (not a vector bucket).

**Console:** S3 → **Create bucket** → name `miracle-kb-data-<account-id>` (globally
unique), Region **ap-southeast-1**, defaults otherwise → **Create**. Open the bucket →
**Upload** → add `miracle-profile.md`.

**CLI (alternative):**
```bash
REGION=ap-southeast-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="miracle-kb-data-${ACCOUNT_ID}"

aws s3api create-bucket \
  --bucket "${BUCKET_NAME}" \
  --region "${REGION}" \
  --create-bucket-configuration LocationConstraint="${REGION}"

aws s3 cp miracle-profile.md "s3://${BUCKET_NAME}/"
```

### 1c. Create the Knowledge Base (vector store = S3 Vectors)

1. Bedrock console (region **ap-southeast-1**) → left nav → **Knowledge bases**.
2. **Create** → **Knowledge Base with vector store**.

**Details**
- **Name**: `miracle-knowledge-base`
- **Description**: `Knowledge base for Miracle Technologies company profile`
- **IAM permissions**: **Create and use a new service role** (Bedrock auto-creates it).
  Because the embedding model (Cohere Embed English v3) is a **third-party** model, the
  first sync triggers a Marketplace auto-subscription — if it fails, see
  **"Activate the Cohere embedding subscription"** in Troubleshooting.

**Data source**
- **Name**: `miracle-s3-source` · **Type**: **Amazon S3** ·
  **S3 URI**: `s3://miracle-kb-data-<account-id>/`
- **Chunking**: **Default** (300 tokens, 20% overlap).
  Keep chunks **≤ 512 tokens** — Cohere embedding models cap input at ~512 tokens per
  request; default chunking is safely under this.

**Embedding model**
- Choose **Embed English v3** (`cohere.embed-english-v3`), **Dimensions** `1024`,
  **Floating-point**.
- (Titan V2 is not available here. Use **Embed Multilingual v3** only if you add
  non-English content. Avoid **Embed v4** — it requires an inference profile the KB
  console flow doesn't accept for embeddings.)

**Vector store**
- **Quick create a new vector store** → **Amazon S3 Vectors**. Bedrock creates an S3
  vector bucket (e.g. `bedrock-kb-...`) and index. Leave encryption default (SSE-S3).

**Review and create** → wait for **Ready** (1–3 min).

> **Capture the Knowledge Base ID** (e.g. `ABCD1234EF`) — you set it as the Lambda env
> var `KNOWLEDGE_BASE_ID` in Step 2.

### 1d. Sync the data source

**Console:** open `miracle-knowledge-base` → **Data source** → select `miracle-s3-source`
→ **Sync** → wait for **Ready** (under a minute for one small file).

**CLI (alternative):**
```bash
REGION=ap-southeast-1
KB_ID=$(aws bedrock-agent list-knowledge-bases --region "${REGION}" \
  --query "knowledgeBaseSummaries[?name=='miracle-knowledge-base'].knowledgeBaseId" --output text)
DS_ID=$(aws bedrock-agent list-data-sources --knowledge-base-id "${KB_ID}" --region "${REGION}" \
  --query "dataSourceSummaries[0].dataSourceId" --output text)
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "${KB_ID}" --data-source-id "${DS_ID}" --region "${REGION}"
```

> If the sync fails with an `aws-marketplace:Subscribe` / `ViewSubscriptions` error, the
> Cohere subscription hasn't completed — see **"Activate the Cohere embedding
> subscription"** in Troubleshooting, then re-sync.

### 1e. Verify retrieval

**Console:** open the KB → **Test Knowledge Base** → toggle **Generate responses OFF** to
see raw **retrieved chunks + scores** (exactly what the Lambda's `Retrieve` returns).

**CLI (retrieve only — matches the app's RAG flow):**
```bash
REGION=ap-southeast-1
KB_ID=<your-kb-id>
aws bedrock-agent-runtime retrieve \
  --region "${REGION}" --knowledge-base-id "${KB_ID}" \
  --retrieval-query '{"text":"What products does Miracle Technologies offer?"}' \
  --retrieval-configuration '{"vectorSearchConfiguration":{"numberOfResults":4}}'
```

**Sample prompts** (all grounded in `miracle-profile.md`):

| Prompt | Expected source |
|--------|----------------|
| `What products does Miracle Technologies offer?` | Products / FAQ |
| `What was Miracle's revenue in FY 2025?` | Revenue table / FAQ |
| `What markets does Miracle operate in?` | Highlights / FAQ |
| `What is Miracle planning to do with its Series A funding?` | Investment plans / FAQ |
| `What cloud infrastructure does Miracle use?` | Highlights / FAQ |
| `Does Miracle have any certifications?` | Highlights / FAQ |

---

## Step 2 — Deploy the Lambda (CLI)

```bash
export KNOWLEDGE_BASE_ID=ABCD1234EF        # from Step 1
export REGION=ap-southeast-1               # optional (default)

./scripts/deploy-lambda.sh
```

What it does: creates the `ChatbotRagRole` IAM role (Bedrock invoke/converse + KB
`Retrieve` + Marketplace subscribe + CloudWatch Logs), installs production deps, zips
`chatbot/lambda/rag`, and creates/updates the `chatbot-rag` function (Node.js 22.x, 30s
timeout, 256 MB) with env vars `KNOWLEDGE_BASE_ID` and `ALLOWED_ORIGIN`.

**Smoke test (prints answer + metrics):**
```bash
aws lambda invoke --function-name chatbot-rag --region ap-southeast-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"body":"{\"message\":\"What products does Miracle offer?\",\"modelId\":\"apac.amazon.nova-lite-v1:0\"}"}' \
  /tmp/out.json && cat /tmp/out.json | jq
```
Expect a JSON `body` containing `answer`, `usage`, `latencyMs`, `tokensPerSecond`,
`retrieval`, and `estimatedCostUsd`.

---

## Step 3 — Deploy the API Gateway HTTP API (CLI)

```bash
./scripts/deploy-apigw.sh
```

Creates the `chatbot-http` HTTP API with CORS, an AWS_PROXY integration to the Lambda,
a `POST /chat` route, the `$default` auto-deploy stage, and the Lambda invoke
permission. It prints the **API URL**.

**Smoke test:**
```bash
API_URL=https://XXXX.execute-api.ap-southeast-1.amazonaws.com
curl -s -X POST "$API_URL/chat" \
  -H 'content-type: application/json' \
  -d '{"message":"What markets does Miracle operate in?","modelId":"apac.amazon.nova-lite-v1:0"}' | jq
```

CORS preflight check:
```bash
curl -s -i -X OPTIONS "$API_URL/chat" \
  -H 'Origin: http://example.com' \
  -H 'Access-Control-Request-Method: POST' | grep -i access-control
```

---

## Step 4 — Deploy the Frontend (CLI)

```bash
export API_URL=https://XXXX.execute-api.ap-southeast-1.amazonaws.com   # from Step 3
./scripts/deploy-frontend.sh
```

Creates `miracle-chatbot-frontend-<account-id>`, enables static website hosting with a
public-read policy (demo only), injects `API_URL` into `app.js`, uploads the three
files, and prints the **website URL**:

```
http://miracle-chatbot-frontend-<account-id>.s3-website-ap-southeast-1.amazonaws.com
```

Open it and ask: *"What products does Miracle Technologies offer?"* Then switch models
and compare the metrics.

> **HTTP vs HTTPS:** the site is served over HTTP; the API is HTTPS. Browsers allow an
> HTTP page to `fetch` an HTTPS endpoint, so the demo works. To serve the site over
> HTTPS, front the bucket with CloudFront + OAC (optional, out of scope here).

---

## Metrics explained

Each answer updates the metrics panel. All values are computed server-side in the
Lambda and returned in the JSON response.

| Metric | Source | Meaning |
|--------|--------|---------|
| **Input tokens** | `Converse` `usage.inputTokens` | Tokens in the prompt — system prompt + retrieved context + question. Larger retrieved context ⇒ more input tokens. |
| **Output tokens** | `usage.outputTokens` | Tokens the model generated for the answer. |
| **Total tokens** | `usage.totalTokens` | Input + output. The basis for cost. |
| **Est. cost (USD)** | computed | `inputTokens/1000 × priceIn + outputTokens/1000 × priceOut`, using the per-model price table in `index.mjs`. Approximate — update prices from the Bedrock pricing page. |
| **Latency (ms)** | measured | End-to-end time in the Lambda: Retrieve + Converse + bookkeeping. |
| **Tokens/sec** | computed | `outputTokens ÷ generation_time` — generation throughput for the chosen model. |
| **Chunks** | `Retrieve` results | How many KB chunks grounded the answer (default top-4). |
| **Top scores** | `retrievalResults[].score` | Similarity scores (0–1) of the retrieved chunks. Higher = more relevant. |
| **Model / Region** | request + env | Which model answered and in which region. |

**Teaching angle:** ask the *same* question with Nova Lite, Claude Haiku, and Claude
Sonnet and compare token-in/token-out, cost, latency, and tokens/sec. This shows the
cost/quality/speed trade-off of model selection in a RAG app. Retrieval metrics
(chunks + scores) are identical across models because retrieval happens before
generation — a good way to separate "retrieval quality" from "generation quality".

Optional stretch metrics (not implemented, easy to add): time-to-first-token (needs
streaming), a retrieval-latency vs generation-latency split, cumulative session cost,
and a grounded-vs-ungrounded flag.

---

## Cost estimate (demo scale)

| Service | Estimated cost |
|---------|---------------|
| S3 data bucket | < $0.01/month |
| S3 Vectors bucket | < $0.01/month (few KB of vectors) |
| Bedrock embedding (Cohere Embed English v3) | < $0.01 (~$0.10 / 1M input tokens; one-time ingestion) |
| Bedrock inference (per query) | ~$0.0002–0.01 depending on model |

Total for a demo: **under $1**.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| KB sync fails with `aws-marketplace:Subscribe` / `ViewSubscriptions` `AccessDenied` (403) | The Cohere embedding **Marketplace subscription has not completed** — even when the role has the Marketplace actions, the agreement may never have been created | Activate the subscription explicitly (see below), then re-sync |
| Sync job fails | S3 permissions | Ensure the KB service role has `s3:GetObject` on the data bucket |
| No results returned / empty answer | KB not synced, or wrong KB ID | Re-sync the data source; verify the KB ID |
| `AccessDeniedException` calling a chat model | Plain model ID in Singapore, or IAM missing the profile ARN | Use the APAC **inference profile** ID; the role allows `inference-profile/*`. Confirm the ID in the Bedrock console |
| `AccessDenied` / "Operation not allowed" only for Claude | Anthropic First-Time-Use form not submitted | Open a Claude model once and submit the FTU form (or `aws bedrock put-use-case-for-model-access`) |
| `ValidationException` / unknown model | `modelId` not in the Lambda allowlist | Add/fix the ID in `MODELS` in `index.mjs` and redeploy (`deploy-lambda.sh`) |
| `KNOWLEDGE_BASE_ID env var is not set` | Env var missing | Re-run `deploy-lambda.sh` with `KNOWLEDGE_BASE_ID` exported |
| CORS error in browser console | Origin blocked | `deploy-apigw.sh` sets CORS to `*` by default; set `CORS_ORIGIN` to your website URL and re-run if you locked it down |
| 500 from the API | Check Lambda logs | `aws logs tail /aws/lambda/chatbot-rag --follow --region ap-southeast-1` |
| `curl` works but the site doesn't | API URL not injected | Confirm `app.js` in the bucket has the real URL, not `__API_URL__` |

### Activate the Cohere embedding subscription (fixes a stuck data sync)

If the sync fails with a message like:

```
Knowledge base role ...AmazonBedrockExecutionRoleForKnowledgeBase_xxxxx is not able to
call specified bedrock embedding model .../cohere.embed-english-v3: Model access is
denied due to IAM user or service role is not authorized to perform the required AWS
Marketplace actions (aws-marketplace:ViewSubscriptions, aws-marketplace:Subscribe) ...
```

…the IAM permissions may already be correct — the real problem is that the **Marketplace
agreement for the model was never created** (the automatic subscription did not
complete). Confirm and fix it directly:

**1. Check the agreement status.**
```bash
REGION=ap-southeast-1
aws bedrock get-foundation-model-availability \
  --region "$REGION" --model-id cohere.embed-english-v3
```
Look at `agreementAvailability.status`:
- `AVAILABLE` → subscription exists; the problem is elsewhere (IAM/propagation — wait
  ~2 min and re-sync).
- `NOT_AVAILABLE` → no agreement yet; create one in step 2.

(You should also see `authorizationStatus: AUTHORIZED`, `entitlementAvailability:
AVAILABLE`, `regionAvailability: AVAILABLE`, confirming the account *may* subscribe.)

**2. Get the offer token.**
```bash
aws bedrock list-foundation-model-agreement-offers \
  --region "$REGION" --model-id cohere.embed-english-v3 \
  --query 'offers[0].offerToken' --output text
```

**3. Create the agreement (starts a usage-based Marketplace subscription).**
```bash
OFFER_TOKEN=$(aws bedrock list-foundation-model-agreement-offers \
  --region "$REGION" --model-id cohere.embed-english-v3 \
  --query 'offers[0].offerToken' --output text)

aws bedrock create-foundation-model-agreement \
  --region "$REGION" --model-id cohere.embed-english-v3 \
  --offer-token "$OFFER_TOKEN"
```

> **Billing note:** this creates a Marketplace subscription. Cohere Embed English v3 is
> usage-priced at **~$0.10 per 1M input tokens** in ap-southeast-1 — a fraction of a cent
> for this demo's single small document.

**4. Confirm it's active, then re-sync.**
```bash
aws bedrock get-foundation-model-availability \
  --region "$REGION" --model-id cohere.embed-english-v3 \
  --query 'agreementAvailability.status'
# expect: "AVAILABLE"
```
Then return to the Knowledge Base and click **Sync** again (allow up to ~2 min for the
entitlement to propagate).

> **IAM note:** the auto-created KB service role already carries the Marketplace actions
> in its `AmazonBedrockFoundationModelPolicyForKnowledgeBase_*` managed policy
> (conditioned on `aws:CalledViaLast = bedrock.amazonaws.com`). You normally do **not**
> need more IAM permissions — you need the **agreement** to exist, which
> `create-foundation-model-agreement` guarantees.
>
> **Anthropic (Claude)** additionally requires the one-time FTU form before
> `create-foundation-model-agreement`: run `aws bedrock put-use-case-for-model-access`.
> Cohere does not.

---

## Teardown (avoid charges)

Delete the CLI-created resources first:

```bash
REGION=ap-southeast-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 1. API Gateway HTTP API
API_ID=$(aws apigatewayv2 get-apis --region $REGION \
  --query "Items[?Name=='chatbot-http'].ApiId | [0]" --output text)
aws apigatewayv2 delete-api --api-id "$API_ID" --region $REGION

# 2. Lambda function
aws lambda delete-function --function-name chatbot-rag --region $REGION

# 3. IAM role (delete inline policy first)
aws iam delete-role-policy --role-name ChatbotRagRole --policy-name ChatbotRagPolicy
aws iam delete-role --role-name ChatbotRagRole

# 4. Frontend website bucket (empty, then delete)
aws s3 rb "s3://miracle-chatbot-frontend-${ACCOUNT_ID}" --force --region $REGION
```

Then the **console** resources from Step 1:

1. **Bedrock → Knowledge bases → `miracle-knowledge-base` → Delete** (choose the
   **DELETE** data-deletion policy to also purge vectors).
2. **S3 → the `bedrock-kb-*` S3 Vectors bucket** → empty → delete.
3. **S3 → `miracle-kb-data-<account-id>`** → empty → delete.
4. **IAM → `AmazonBedrockExecutionRoleForKnowledgeBase_*`** → delete.

Verify nothing remains:
```bash
aws lambda list-functions --region $REGION --query "Functions[?FunctionName=='chatbot-rag']"
aws apigatewayv2 get-apis --region $REGION --query "Items[?Name=='chatbot-http']"
aws s3 ls | grep -E 'miracle-(kb-data|chatbot-frontend)'
```
