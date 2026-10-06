#!/usr/bin/env bash
#
# deploy-lambda.sh — create the IAM role and deploy the chatbot-rag Lambda (AWS CLI).
#
# Prereqs:
#   - AWS CLI v2 configured for an account/region with Bedrock access.
#   - The Bedrock Knowledge Base already created in the console (Task 2); you have its ID.
#   - Node.js + npm installed locally (to install the Lambda's production deps).
#
# Usage:
#   KNOWLEDGE_BASE_ID=XXXXXXXXXX ./scripts/deploy-lambda.sh
#
# Optional env overrides:
#   REGION (default ap-southeast-1), FUNCTION_NAME (default chatbot-rag),
#   ROLE_NAME (default ChatbotRagRole), ALLOWED_ORIGIN (default *)
#
set -euo pipefail

REGION="${REGION:-ap-southeast-1}"
FUNCTION_NAME="${FUNCTION_NAME:-chatbot-rag}"
ROLE_NAME="${ROLE_NAME:-ChatbotRagRole}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-*}"
RUNTIME="nodejs22.x"
HANDLER="index.handler"
TIMEOUT=30
MEMORY=256

if [[ -z "${KNOWLEDGE_BASE_ID:-}" ]]; then
  echo "ERROR: set KNOWLEDGE_BASE_ID (the Bedrock KB id from the console)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="${SCRIPT_DIR}/../chatbot/lambda/rag"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo ">> Region=${REGION}  Account=${ACCOUNT_ID}  Function=${FUNCTION_NAME}"

# --- 1. IAM role ---------------------------------------------------------------
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'

# Permissions: Bedrock invoke/converse on foundation models AND APAC inference
# profiles, KB Retrieve, CloudWatch Logs, and AWS Marketplace subscribe.
#
# NOTE (model enablement, Sep 2025+): Bedrock removed the "Model access" page —
# serverless models are auto-enabled per Region. Access is now IAM-driven. The first
# time this role invokes a THIRD-PARTY model (Anthropic Claude, Cohere), Bedrock
# auto-initiates an AWS Marketplace subscription, which needs aws-marketplace:Subscribe
# + ViewSubscriptions. (Amazon Nova is not in Marketplace and needs neither.) Anthropic
# models also require a one-time First-Time-Use form in the account before first use.
PERMISSIONS_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:Converse", "bedrock:ConverseStream"],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:${ACCOUNT_ID}:inference-profile/*"
      ]
    },
    {
      "Sid": "BedrockRetrieve",
      "Effect": "Allow",
      "Action": ["bedrock:Retrieve"],
      "Resource": "arn:aws:bedrock:${REGION}:${ACCOUNT_ID}:knowledge-base/*"
    },
    {
      "Sid": "MarketplaceSubscribe",
      "Effect": "Allow",
      "Action": ["aws-marketplace:Subscribe", "aws-marketplace:ViewSubscriptions"],
      "Resource": "*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:${REGION}:${ACCOUNT_ID}:*"
    }
  ]
}
JSON
)

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo ">> IAM role ${ROLE_NAME} already exists — updating inline policy."
else
  echo ">> Creating IAM role ${ROLE_NAME}."
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" >/dev/null
fi

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "ChatbotRagPolicy" \
  --policy-document "${PERMISSIONS_POLICY}"

ROLE_ARN="$(aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text)"
echo ">> Role ARN: ${ROLE_ARN}"

# IAM is eventually consistent; give the role a moment before Lambda uses it.
echo ">> Waiting 10s for IAM role propagation..."
sleep 10

# --- 2. Package the Lambda -----------------------------------------------------
echo ">> Installing production dependencies and zipping."
pushd "${LAMBDA_DIR}" >/dev/null
rm -rf node_modules
npm install --omit=dev --no-audit --no-fund
ZIP_FILE="$(mktemp -t chatbot-rag-XXXX).zip"
rm -f "${ZIP_FILE}"
zip -qr "${ZIP_FILE}" index.mjs package.json node_modules
popd >/dev/null
echo ">> Package: ${ZIP_FILE}"

# --- 3. Create or update the function -----------------------------------------
ENV_VARS="Variables={KNOWLEDGE_BASE_ID=${KNOWLEDGE_BASE_ID},ALLOWED_ORIGIN=${ALLOWED_ORIGIN}}"

if aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  echo ">> Updating existing function code + config."
  aws lambda update-function-code \
    --function-name "${FUNCTION_NAME}" \
    --zip-file "fileb://${ZIP_FILE}" \
    --region "${REGION}" >/dev/null
  aws lambda wait function-updated --function-name "${FUNCTION_NAME}" --region "${REGION}"
  aws lambda update-function-configuration \
    --function-name "${FUNCTION_NAME}" \
    --timeout "${TIMEOUT}" --memory-size "${MEMORY}" \
    --environment "${ENV_VARS}" \
    --region "${REGION}" >/dev/null
else
  echo ">> Creating function ${FUNCTION_NAME}."
  aws lambda create-function \
    --function-name "${FUNCTION_NAME}" \
    --runtime "${RUNTIME}" \
    --role "${ROLE_ARN}" \
    --handler "${HANDLER}" \
    --timeout "${TIMEOUT}" --memory-size "${MEMORY}" \
    --environment "${ENV_VARS}" \
    --zip-file "fileb://${ZIP_FILE}" \
    --region "${REGION}" >/dev/null
fi

aws lambda wait function-active-v2 --function-name "${FUNCTION_NAME}" --region "${REGION}" 2>/dev/null || \
  aws lambda wait function-active --function-name "${FUNCTION_NAME}" --region "${REGION}"

rm -f "${ZIP_FILE}"

echo ""
echo ">> Done. Smoke test (returns answer + metrics JSON):"
cat <<EOF

  aws lambda invoke --function-name ${FUNCTION_NAME} --region ${REGION} \\
    --cli-binary-format raw-in-base64-out \\
    --payload '{"body":"{\"message\":\"What products does Miracle offer?\",\"modelId\":\"apac.amazon.nova-lite-v1:0\"}"}' \\
    /tmp/out.json && cat /tmp/out.json | jq

EOF
echo ">> Next: ./scripts/deploy-apigw.sh"
