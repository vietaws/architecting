#!/usr/bin/env bash
#
# deploy-apigw.sh — create an API Gateway HTTP API fronting the chatbot-rag Lambda.
#
# Creates: HTTP API with CORS, AWS_PROXY integration, POST /chat route,
#          Lambda invoke permission, and an auto-deployed $default stage.
# Prints the invoke URL (use it as API_URL in the frontend / deploy-frontend.sh).
#
# Prereqs: deploy-lambda.sh has run (the Lambda exists).
#
# Usage:
#   ./scripts/deploy-apigw.sh
#
# Optional env overrides:
#   REGION (default ap-southeast-1), FUNCTION_NAME (default chatbot-rag),
#   API_NAME (default chatbot-http), CORS_ORIGIN (default *)
#
set -euo pipefail

REGION="${REGION:-ap-southeast-1}"
FUNCTION_NAME="${FUNCTION_NAME:-chatbot-rag}"
API_NAME="${API_NAME:-chatbot-http}"
CORS_ORIGIN="${CORS_ORIGIN:-*}"
ROUTE_KEY="POST /chat"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
LAMBDA_ARN="$(aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${REGION}" \
  --query 'Configuration.FunctionArn' --output text)"

echo ">> Region=${REGION}  Lambda=${LAMBDA_ARN}"

# --- 1. Create (or reuse) the HTTP API with CORS -------------------------------
API_ID="$(aws apigatewayv2 get-apis --region "${REGION}" \
  --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)"

if [[ "${API_ID}" == "None" || -z "${API_ID}" ]]; then
  echo ">> Creating HTTP API ${API_NAME}."
  API_ID="$(aws apigatewayv2 create-api \
    --name "${API_NAME}" \
    --protocol-type HTTP \
    --cors-configuration "AllowOrigins=${CORS_ORIGIN},AllowMethods=POST,OPTIONS,AllowHeaders=content-type" \
    --region "${REGION}" \
    --query 'ApiId' --output text)"
else
  echo ">> Reusing existing HTTP API ${API_NAME} (${API_ID}); updating CORS."
  aws apigatewayv2 update-api \
    --api-id "${API_ID}" \
    --cors-configuration "AllowOrigins=${CORS_ORIGIN},AllowMethods=POST,OPTIONS,AllowHeaders=content-type" \
    --region "${REGION}" >/dev/null
fi
echo ">> API ID: ${API_ID}"

# --- 2. Integration (AWS_PROXY, payload format 2.0) ----------------------------
INTEGRATION_ID="$(aws apigatewayv2 create-integration \
  --api-id "${API_ID}" \
  --integration-type AWS_PROXY \
  --integration-uri "${LAMBDA_ARN}" \
  --payload-format-version "2.0" \
  --integration-method POST \
  --region "${REGION}" \
  --query 'IntegrationId' --output text)"
echo ">> Integration ID: ${INTEGRATION_ID}"

# --- 3. Route POST /chat -------------------------------------------------------
# Remove any existing matching route first (idempotent re-runs).
EXISTING_ROUTE="$(aws apigatewayv2 get-routes --api-id "${API_ID}" --region "${REGION}" \
  --query "Items[?RouteKey=='${ROUTE_KEY}'].RouteId | [0]" --output text)"
if [[ "${EXISTING_ROUTE}" != "None" && -n "${EXISTING_ROUTE}" ]]; then
  aws apigatewayv2 delete-route --api-id "${API_ID}" --route-id "${EXISTING_ROUTE}" --region "${REGION}"
fi

aws apigatewayv2 create-route \
  --api-id "${API_ID}" \
  --route-key "${ROUTE_KEY}" \
  --target "integrations/${INTEGRATION_ID}" \
  --region "${REGION}" >/dev/null
echo ">> Route created: ${ROUTE_KEY}"

# --- 4. Auto-deploy stage ($default) -------------------------------------------
# NOTE: '$default' is the literal HTTP API default stage name required by AWS.
# Single quotes are intentional to prevent shell expansion.
# shellcheck disable=SC2016
if ! aws apigatewayv2 get-stage --api-id "${API_ID}" --stage-name '$default' --region "${REGION}" >/dev/null 2>&1; then
  # shellcheck disable=SC2016
  aws apigatewayv2 create-stage \
    --api-id "${API_ID}" \
    --stage-name '$default' \
    --auto-deploy \
    --region "${REGION}" >/dev/null
fi

# --- 5. Lambda invoke permission for API Gateway -------------------------------
STATEMENT_ID="apigw-${API_ID}"
aws lambda remove-permission --function-name "${FUNCTION_NAME}" \
  --statement-id "${STATEMENT_ID}" --region "${REGION}" >/dev/null 2>&1 || true

aws lambda add-permission \
  --function-name "${FUNCTION_NAME}" \
  --statement-id "${STATEMENT_ID}" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/chat" \
  --region "${REGION}" >/dev/null
echo ">> Lambda invoke permission granted."

# --- 6. Output the invoke URL --------------------------------------------------
API_URL="$(aws apigatewayv2 get-api --api-id "${API_ID}" --region "${REGION}" \
  --query 'ApiEndpoint' --output text)"

echo ""
echo ">> API URL: ${API_URL}"
echo ">> Smoke test:"
cat <<EOF

  curl -s -X POST "${API_URL}/chat" \\
    -H 'content-type: application/json' \\
    -d '{"message":"What products does Miracle offer?","modelId":"apac.amazon.nova-lite-v1:0"}' | jq

EOF
echo ">> Next: API_URL=${API_URL} ./scripts/deploy-frontend.sh"
