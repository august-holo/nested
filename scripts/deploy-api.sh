#!/bin/bash
# Build the API for arm64 Linux, upload it, and have the instance install it.
# Used by CI and for manual deploys. Requires cargo-zigbuild and AWS credentials.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# Written by Terraform on a laptop; CI has the same names as environment variables.
if [ -f "$ROOT/.github/deploy.env" ]; then
  set -a && source "$ROOT/.github/deploy.env" && set +a
fi
for v in AWS_REGION ARTIFACTS_BUCKET INSTANCE_ID DEPLOY_DOCUMENT; do : "${!v:?$v is not set}"; done
export AWS_REGION

SHA=${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD)}
TARGET=aarch64-unknown-linux-musl
BIN="$ROOT/api/target/$TARGET/release/api"

(cd "$ROOT/api" && cargo zigbuild --release --locked --target "$TARGET")

if command -v sha256sum >/dev/null; then
  SUM=$(sha256sum "$BIN" | cut -d' ' -f1)
else
  SUM=$(shasum -a 256 "$BIN" | cut -d' ' -f1)
fi

aws s3 cp "$BIN" "s3://$ARTIFACTS_BUCKET/api/$SHA/api" --only-show-errors
printf '%s' "$SUM" | aws s3 cp - "s3://$ARTIFACTS_BUCKET/api/$SHA/api.sha256" --only-show-errors

COMMAND_ID=$(aws ssm send-command \
  --document-name "$DEPLOY_DOCUMENT" \
  --instance-ids "$INSTANCE_ID" \
  --parameters "sha=$SHA" \
  --query Command.CommandId --output text)

echo "deploying $SHA (command $COMMAND_ID)"
aws ssm wait command-executed --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" || true

RESULT=$(aws ssm get-command-invocation --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" \
  --query '[Status, StandardOutputContent, StandardErrorContent]' --output text)
echo "$RESULT"
[[ $RESULT == Success* ]]
