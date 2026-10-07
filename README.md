# nested

https://nested.holotekt.com

Write with notes in the margins; read it back as prose. The left pane is markdown with
nested lists and `[bracketed]` notes; the right pane shows the same text with the notes
removed and the top-level points run together into paragraphs.

```
CloudFront (nested.holotekt.com)
  ├─ /*      → S3            static Next.js export        web/
  └─ /api/*  → EC2 t4g.nano  Rust (axum) under systemd    api/
                               ├─ verifies Cognito access tokens
                               └─ SQLite in /var/lib/nested
```

| Directory | Contents |
|---|---|
| `api/` | Rust backend. Documents live in SQLite, owned by the signed-in user |
| `web/` | Next.js (TypeScript), exported as static files |
| `infra/` | Terraform for everything in AWS |
| `scripts/` | Deploy scripts, shared by CI and manual deploys |

## How the prose is made

`web/app/lib/prose.ts`, with its tests in `prose.test.ts` (`npm test`):

- headings stay headings;
- top-level list items become sentences (a full stop is added when missing) and are
  joined into one paragraph;
- nested list items, and their continuation lines, are dropped;
- anything in `[square brackets]` is dropped, along with a `(link target)` that follows it;
- paragraphs and fenced code are kept as they are.

## Local development

```sh
cd api && DEV_USER_SUB=local cargo run   # http://127.0.0.1:8080, auth bypassed, SQLite in api/data
cd web && npm run dev                    # http://localhost:3000, proxies /api to the above
```

Without Cognito settings in `web/.env` the page treats you as signed in, matching the API.
If port 3000 is taken, `npm run dev -- -p 3100` works just the same.

## Deploying

The first deploy, once the GitHub repository `august-holo/nested` exists:

```sh
scripts/bootstrap-state.sh                # once: the S3 bucket for Terraform state
cd infra && terraform init && terraform apply
scripts/deploy-api.sh && scripts/deploy-web.sh
```

After that, pushing to `main` deploys the API and the site through GitHub Actions, each
only when its own files changed. The workflows assume an IAM role via OIDC; there are no
AWS credentials stored in GitHub. Terraform is applied locally, never from CI; its state
is in S3. Terraform writes `.github/deploy.env` and `web/.env`, which hold identifiers,
not secrets, and are committed so CI needs no configuration in GitHub.

## Users

Sign-up is closed. Create a user, who then receives a temporary password by email:

```sh
aws cognito-idp admin-create-user \
  --user-pool-id "$(terraform -chdir=infra output -raw user_pool_id)" \
  --username someone@example.com
```

## Data

Documents are in `/var/lib/nested/nested.sqlite` on the instance, on its encrypted root
volume. Nothing backs that file up yet; an EBS snapshot or a nightly copy to S3 would be
the simple options.

## Access to the instance

There is no SSH. Use Session Manager:

```sh
aws ssm start-session --target "$(terraform -chdir=infra output -raw instance_id)"
journalctl -u nested -f
```
