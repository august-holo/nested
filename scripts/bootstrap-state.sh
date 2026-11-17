#!/bin/bash
# One-time: create the encrypted, versioned bucket that holds Terraform state.
set -euo pipefail

REGION=us-east-1
BUCKET="nested-tfstate-$(aws sts get-caller-identity --query Account --output text)"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "$BUCKET already exists"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
fi

aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

cat > "$(dirname "$0")/../infra/backend.hcl" <<EOF
bucket       = "$BUCKET"
key          = "nested.tfstate"
region       = "$REGION"
encrypt      = true
use_lockfile = true
EOF

echo "state bucket ready: $BUCKET (settings in infra/backend.hcl)"
