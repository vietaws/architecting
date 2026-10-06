#!/usr/bin/env bash
#
# deploy-frontend.sh — host the chatbot frontend on S3 static website hosting.
#
# Creates a bucket, enables static website hosting, applies a public-read policy
# (DEMO ONLY), injects the API URL into app.js, uploads the files, and prints the
# website endpoint.
#
# Prereqs: deploy-apigw.sh has run; you have the API URL.
#
# Usage:
#   API_URL=https://abc123.execute-api.ap-southeast-1.amazonaws.com ./scripts/deploy-frontend.sh
#
# Optional env overrides:
#   REGION (default ap-southeast-1), BUCKET (default miracle-chatbot-frontend-<account>)
#
# SECURITY NOTE: public-read S3 website hosting is for demos only. For anything real,
# serve via CloudFront with Origin Access Control and keep the bucket private.
#
set -euo pipefail

REGION="${REGION:-ap-southeast-1}"

if [[ -z "${API_URL:-}" ]]; then
  echo "ERROR: set API_URL (the API Gateway invoke URL from deploy-apigw.sh)." >&2
  exit 1
fi
API_URL="${API_URL%/}"  # strip trailing slash

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${BUCKET:-miracle-chatbot-frontend-${ACCOUNT_ID}}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/../chatbot/frontend"

echo ">> Region=${REGION}  Bucket=${BUCKET}  API_URL=${API_URL}"

# --- 1. Create the bucket ------------------------------------------------------
if aws s3api head-bucket --bucket "${BUCKET}" >/dev/null 2>&1; then
  echo ">> Bucket already exists."
else
  echo ">> Creating bucket."
  aws s3api create-bucket \
    --bucket "${BUCKET}" \
    --region "${REGION}" \
    --create-bucket-configuration LocationConstraint="${REGION}" >/dev/null
fi

# --- 2. Allow public access (website hosting needs this) -----------------------
aws s3api put-public-access-block \
  --bucket "${BUCKET}" \
  --public-access-block-configuration \
    BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false \
  --region "${REGION}"

PUBLIC_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadForWebsite",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/*"
  }]
}
JSON
)
aws s3api put-bucket-policy --bucket "${BUCKET}" --policy "${PUBLIC_POLICY}" --region "${REGION}"

# --- 3. Enable static website hosting ------------------------------------------
aws s3 website "s3://${BUCKET}/" --index-document index.html --region "${REGION}"

# --- 4. Inject the API URL into app.js (write to a temp build dir) --------------
BUILD_DIR="$(mktemp -d -t miracle-frontend-XXXX)"
cp "${FRONTEND_DIR}/index.html" "${FRONTEND_DIR}/style.css" "${BUILD_DIR}/"
# Replace the placeholder regardless of platform (sed -i differs across OSes).
sed "s#__API_URL__#${API_URL}#g" "${FRONTEND_DIR}/app.js" > "${BUILD_DIR}/app.js"

if grep -q '__API_URL__' "${BUILD_DIR}/app.js"; then
  echo "ERROR: API URL placeholder was not replaced." >&2
  exit 1
fi

# --- 5. Upload -----------------------------------------------------------------
aws s3 sync "${BUILD_DIR}/" "s3://${BUCKET}/" --delete --region "${REGION}"
rm -rf "${BUILD_DIR}"

WEBSITE_URL="http://${BUCKET}.s3-website-${REGION}.amazonaws.com"
echo ""
echo ">> Frontend deployed."
echo ">> Website URL: ${WEBSITE_URL}"
echo ">> Open it in a browser and ask: 'What products does Miracle offer?'"
