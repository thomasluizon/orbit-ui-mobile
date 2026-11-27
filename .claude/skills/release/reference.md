# Release reference

Facts for `/release`, `/android-release` and `/ios-release`. The skills own the procedures. This file holds the facts they do not.

## Contents

- Release order and gates
- CI facts
- Release and infrastructure facts
- Render and Terraform facts
- Secrets and accounts

## Release order and gates

- A merge or a push deploys nothing by itself. The driver release train deploys on its cadence, and `/release` starts the same train at once.
- The train starts when `node tools/release-plan.mjs` shows `needsRelease: true` for a service and the previous train ended at least 4 hours ago. Only one train runs at a time. It releases staging first and then production, for each service in order.
- The train releases mobile staging as Android track `internal` plus iOS variant `staging`, and mobile production as Android track `open` plus iOS variant `production`. The Android `android_version_code` is the newest code of the Android Release run titles plus one for staging and plus two for production. The iOS `build_number` is the highest build of the app in App Store Connect plus one.
- The train dispatches each Android and iOS step with `source_sha` set to the planned commit of the mobile release. Each workflow builds that commit, so `main` can move and merges never wait for the train.
- The planned web and mobile commit is the newest of the last 100 `main` commits with green `test.yml` and `guards.yml` push runs. The head of `main` can have no run of its own.
- Route all work to `main` in every repository.
- Release in this order: API, web, landing, then mobile. Stop after a failed release or a failed verification.
- Android fixes on `main` ship to the Open track. The production track stays empty until the owner orders a launch.
- One mobile release ships Android and iOS at the same `app_version` from the same commit. Each store keeps its own build counter.
- Release Android first. Release iOS at the Android version. Never release on the App Store before the owner orders the Android public release.
- A release of one platform alone needs a defect that only that platform has, and a `platform_only_reason`.
- Production web and production API releases never run at the same time. Some codes live in a per-instance memory cache until a shared store replaces it.
- A staging web release never runs while a production web release runs.
- An API release with a migration takes a fresh Render export first. Each destructive operation gets its own current backup and drain proof.
- Skip a web release when `git diff --name-only` since the served commit shows no `apps/web` or `packages/shared` file.
- Staging off stops the train at that service. The owner fixes staging, or asks for `force_unstaged` on one hand dispatch.
- A new value in a response enum breaks a client with a strict schema enum. Ship the accepting client first, or send the value only to clients that declare support.
- The Render MCP has no workspace selected: never pick one.

## CI facts

- Read test results by exit code, never by summary text. With the locale unset, the summary prints in Portuguese.
- In this repository, a body edit re-runs only `PR Metadata`. A label change starts no run. `Guards` and `PR Tests` run on `opened`, `synchronize` and `reopened`.
- In `orbit-api` and `orbit-landing-page`, a title or body edit re-runs `PR Text`. Its concurrency group cancels the older run.
- A cancelled run stays on the head as a `cancelled` check run. Read only the newest check run of each check name and app.
- A `cancelled` check run that no newer run replaced is failing. Run `gh run list --commit <sha>`, then rerun it.
- A pull request that conflicts with its base runs no CI. Merge the base forward first.
- A rerun of a `pull_request` workflow reuses the merge commit of its first trigger. A red caused by an older base does not clear on a rerun.
- A `parity:exempt` label does not change a run that started before the label. Trigger a new pull request event after you apply it.
- GitHub Pro permits 40 concurrent hosted jobs. Avoid duplicate pushes and needless base merges.
- Run `npx turbo run type-check --force` from the repository root when cache freshness matters.
- Run the `orbit-api` suite with `LANG` unset and with `LC_ALL=en_US.UTF-8` to catch host-culture formatting.
- `GitGuardian Security Checks` is required on `main` in `orbit-api` and `orbit-landing-page`. Its suite can wait in the vendor queue. Only waiting clears it.
- On `orbit-api`, the `CodeQL` results check is not required. The `Analyze` jobs are required. Dismiss a verified false positive with a written reason of 280 characters or fewer, then rerun CodeQL.
- The SonarCloud gate needs 80 percent or more coverage on new code and reliability A. An uncovered new condition lowers the figure.
- The GitHub GraphQL budget is 5,000 points an hour for the whole account. Pause between calls in a loop and stop on the first rate-limit error.
- `gh issue list --search` spends the separate search limit. REST keeps working while GraphQL is exhausted.
- Probe GraphQL with `gh api graphql -f query='query{rateLimit{remaining resetAt}}'`. The REST `rate_limit` view can show a stale figure.
- Start `tools/wait-release.mjs` and each long local check as a Bash background task with `timeout` 7200000, with no pipe and no trailing `&`.

## Release and infrastructure facts

- The driver reads `RENDER_MCP_TOKEN` and the three `APP_STORE_CONNECT_API_*` variables of `tools/testflight-access.mjs` from its own environment. With no `RENDER_MCP_TOKEN` the plan fails and no train starts. With no App Store Connect variable the train holds only the iOS steps.
- Each release job reads `RENDER_API_KEY` from its own GitHub environment: `production`, `staging`, and `render-operations` for the API scheduled Render jobs. Each environment deploys only from `main`.
- The Render web services have auto-deploy off.
- `tools/wait-release.mjs` needs full 40-character SHAs for `--sha` and `--workflow-sha`, and the origin in `--service-url`. Use `--workflow android` for an Android run.
- Service origins:
  - production web: `https://orbit-web-3qmv.onrender.com`
  - staging web: `https://orbit-web-staging-eakn.onrender.com`
  - production API: `https://api.useorbit.org`
  - staging API: `https://api-staging.useorbit.org`
  - landing staging: `https://orbit-landing-staging.onrender.com`
  - landing production: `https://useorbit.org`
- A Dependabot auto-merge in `orbit-api` runs through `GITHUB_TOKEN` and starts no push runs. Dispatch `test.yml` and `guards.yml` on `main` at that commit before you release it.
- `node tools/release-plan.mjs` reads both API baselines from `/health`. A production API release needs a staging image digest for its commit, so it waits for staging to serve.
- The refusal "GitHub comparison ... diverged or omitted commits" can be transient. Rerun the plan once.
- Staging stays on the Render free plan. Free web services sleep after 15 minutes. A waking staging API answers 429. A pinger keeps it awake from 08:00 to 24:00 Sao Paulo time.
- Free Postgres expires 30 days after creation, has no backups and allows one per workspace. At expiry, create a free one and reseed it.
- Configure an external service from its current documentation, never from memory. Pick the current option over a legacy one.
- Keep the repositories public. Hosted CI is free only for public repositories, and CodeQL covers only open source code. Never commit Terraform state or a secret.

## Render and Terraform facts

- Terraform for Render lives in `orbit-api` `infra/`. State lives in S3 bucket `orbit-terraform-state-713285551626` (us-east-2). Secrets live in SSM `/orbit/<environment>/<service>/<KEY>`.
- Plan and apply from the `orbit-api` checkout with `RENDER_API_KEY=$RENDER_MCP_TOKEN`, `CLOUDFLARE_API_TOKEN` from the Keychain, the default AWS profile (`orbit-operator`) and an ignored `infra/local.tfvars` with the web image digests.
- Apply only with `-target` lists. Never run an untargeted apply.
- An `orbit-api` change whose Manual steps name staging Terraform gets that targeted apply from API `main` before the staging API release that carries it.
- Never update a web service through Terraform. Provider v1.9.1 turns a digest image path into a tag on any web service update. The release workflows own the digests.
- Key project environments by their live names. Another key plans a destroy. An empty `custom_domains` must be null.
- The imported production API ignores its own env vars.
- Render does not redeploy a linked service when its env group changes. Redeploy the unchanged commit and confirm `/health`. A service created before its env group is linked needs a redeploy.
- The Hobby workspace allows two environments for each project and keeps no HTTP request logs. No API exposes a deploy hook URL. The trigger-deploy API can answer 202 with no body.
- The Render MCP creates services, triggers deploys, edits environment variables and reads logs, metrics and read-only SQL. It cannot delete anything or change other settings.
- Service ids:
  - production API `srv-d6tc2isr85hc739bf75g`
  - production Postgres `dpg-dasotg8473hc739a5gpg-a`
  - production API env group `evg-dasotr7pn0mc739cm050`
  - staging API `srv-dasotg8473hc739a5gjg`
  - staging web `srv-dass1t0jo6nc73d5s340`
  - staging Postgres `dpg-dbes71vavr4c73bv8bt0-a`
- Both Postgres allow lists hold only the operator Mac. Run read-only SQL through local `psql`.
- The staging reseed workflow opens the allow list to the runner address only and restores it after each step. The `orbit-staging-reseed` AWS role trusts only the `render-operations` environment of `orbit-api`.
- Staging billing runs on Stripe test mode. Ids and secrets live in SSM `/orbit/staging/api/Stripe__*`.
- AWS SES has production access (50,000 sends a day, us-east-2). CloudWatch has only account-level SES metrics. Time one isolated simulator send to attribute a send.
- `useorbit.org` DNS is on Cloudflare (zone `3f80ecc2735314886702b6643b15d150`) and has DNSSEC. Its DS record sits at Spaceship. Never add a DS record for a zone that is not the delegated, signed zone.
- The Keychain token `orbit-cloudflare-api-token` is an Account API Token on account `29945c90bc934c629c8e5a11cbfd146b` with Workers Admin. Verify it at `/accounts/<id>/tokens/verify`. It cannot read Workers Observability, so read the `orbit-staging-pinger` invocations in the dashboard.

## Secrets and accounts

- Never read a live secret into the transcript. Pipe it from its source (an environment variable, the Keychain or SSM) into its destination, such as `gh secret set` on stdin.
- Do not use a secret that exists only in a dashboard with no API.
- The owner stores a secret that only a browser can create in the macOS Keychain. Read it with `security find-generic-password -s <service> -w` and never print it. The services are `orbit-cloudflare-api-token`, `orbit-cloudflare-read-only-api-token` and `orbit-stripe-test-secret-key`.
- Staging seeds fixed sign-in codes for `qa@useorbit.org` and `reviewer@useorbit.org` in `/orbit/staging/api/TEST_ACCOUNTS`. Read them from SSM and never print them.
- Never request a production sign-in code for the owner's own account. The owner solves CAPTCHAs and reads emailed codes.
- Never advise a key rotation because a key showed in a redacted log or a worker report.
- Do not sign in to staging web through Google in Chrome. Do not sign in to a third-party dashboard through an OAuth grant.
- Never retry a call that the permission classifier refused. Name it in one line so the owner can allow it, and keep working.
- Sentry organization `orbit-ai-habit-tracker`, region `https://us.sentry.io`. Read it through the Sentry MCP.
- The Azure CLI is signed in to the Orbit directory. For company facts read the brain note `2 Areas/10-19 Orbit Business/13 Legal & LTDA/Orbit legal entity.md`, then `CARTAO CNPJ.pdf` in Drive.
