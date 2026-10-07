#!/bin/bash
# Build the static site, sync it to S3, and invalidate CloudFront.
# Used by CI and for manual deploys. Requires Node and AWS credentials.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a && source "$ROOT/.github/deploy.env" && set +a

(cd "$ROOT/web" && npm ci && npm run lint && npm run build)

# Hashed assets never change; everything else is revalidated on each request to CloudFront.
aws s3 sync "$ROOT/web/out/_next" "s3://$SITE_BUCKET/_next" \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors
aws s3 sync "$ROOT/web/out" "s3://$SITE_BUCKET" --delete \
  --exclude "_next/*" --cache-control "public, max-age=0, must-revalidate" --only-show-errors

aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query Invalidation.Id --output text
