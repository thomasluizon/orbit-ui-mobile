# Web image deployment

> **At a glance** - `Dockerfile` builds the web workspace into a standalone Next.js image. CI authenticates its Node base pulls through GHCR; a daily workflow refreshes the official image copy. The manual release workflow builds and deploys a selected branch to staging or `main` to production. The explicit `production-redesign` target builds only `redesign/main` for the second production web service.

The image lives at `ghcr.io/thomasluizon/orbit-web`. The release workflow tags it with the source commit SHA, then deploys the immutable digest. Render services `orbit-web-staging`, `orbit-web`, and the redesign production service must be image-backed web services configured to pull this GHCR image. Give each service a GHCR registry credential, set port `3000`, and check `/api/health`. The image runs `node server.js` as the `orbit` user. The image carries `WEB_COMMIT_SHA`; the health response includes that SHA so the workflows can verify the served build. The builder stage also inlines it as `NEXT_PUBLIC_WEB_COMMIT_SHA`, and the About screen shows its first 7 characters as the web version.

## GitHub settings

In repository **Settings > Secrets and variables > Actions**, set the repository secrets `SMOKE_TEST_EMAIL` and `SMOKE_TEST_CODE`. The smoke credentials must belong to the dedicated production smoke account. In **Settings > Environments**, restrict both `production` and `staging` to deployments from `main` and leave required reviewers empty. Both environments hold their own `RENDER_API_KEY` secret. Dispatch every web release with `--ref main`; staging can still build the branch selected by the workflow input. The Android internal track uses `android-internal` so it can build its selected branch without entering the web staging environment. After both web release paths succeed and `/api/health` reports their selected commits, delete the repository secret `RENDER_API_KEY` from **Settings > Secrets and variables > Actions**. Set these repository variables:

| Variable | Purpose |
| --- | --- |
| `RENDER_WEB_STAGING_SERVICE_ID` | Render service ID for `orbit-web-staging`, used by the release workflow and planner |
| `RENDER_WEB_SERVICE_ID` | Render service ID for `orbit-web` |
| `RENDER_WEB_REDESIGN_SERVICE_ID` | Render service ID for the redesign production web service, created by infrastructure ticket #1417 |
| `PRODUCTION_WEB_HOST` | Production hostname, without `https://` or a path |
| `STAGING_NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `PRODUCTION_NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Public Google OAuth web client ID |
| `STAGING_NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `PRODUCTION_NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public push key |
| `STAGING_NEXT_PUBLIC_EVENT_API_BASE`, `PRODUCTION_NEXT_PUBLIC_EVENT_API_BASE` | Browser reachable API origin for event streaming |
| `STAGING_NEXT_PUBLIC_SITE_URL`, `PRODUCTION_NEXT_PUBLIC_SITE_URL` | Public web origin for metadata, Google OAuth callbacks, and auth redirects; staging releases also verify `/api/health` at the staging origin |
| `STAGING_NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `PRODUCTION_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `STAGING_NEXT_PUBLIC_SENTRY_DSN`, `PRODUCTION_NEXT_PUBLIC_SENTRY_DSN` | Public browser Sentry DSN |

These `NEXT_PUBLIC_*` values are embedded during the image build. Set server-only values such as `API_BASE`, Sentry server configuration, and auth credentials in **Render Dashboard > service > Environment**. Do not pass them as Docker build arguments. The Render services must have their own environment settings before deployment.

Keep automatic deploys disabled on all three Render services; releases use explicit digest deployments.

In **Settings > Branches > main > Branch protection**, remove the retired `Post-deploy smoke (required)` check if it is listed as required. The production smoke suite now runs as the final job of the manual release workflow and fails that run when a core flow fails.

After infrastructure ticket #1417 creates the redesign service, set `RENDER_WEB_REDESIGN_SERVICE_ID` in **Settings > Secrets and variables > Actions > Variables**. No separate Render API key is needed. The first owner-triggered `production-redesign` release must reach `live`, report its built commit at `https://<redesign-service>.onrender.com/api/health`, and create a successful `production-redesign` GitHub Deployment. The release planner includes this target only with `--environment production-redesign`.

## Workflows

Both Dockerfile stages use `NODE_IMAGE`, which defaults to `public.ecr.aws/docker/library/node:22-bookworm-slim` for local builds without registry credentials. The PR image job and both release builds override it with `ghcr.io/thomasluizon/orbit-node-base:22-bookworm-slim` after signing in to GHCR with `GITHUB_TOKEN`. The PR job requests `packages: read`; releases request `packages: write`. All three builds use the engine's `docker` driver, which needs no separate BuildKit image or Dockerfile frontend image.

`refresh-node-base.yml` runs daily and on dispatch. It resolves `docker.io/library/node:22-bookworm-slim` once, copies the complete index by digest to GHCR, and fails unless the copied index digest matches. It preserves every platform and attestation without changing labels or annotations. Only this maintenance copy contacts Docker Hub; PR and release builds pull the authenticated GHCR copy. Refresh failures appear in Actions so the workflow can be rerun.

If the package is missing or deleted, dispatch `refresh-node-base.yml` to restore the copy. Its summary and `imagetools inspect` output record the copied index digest.

Publishing with the repository's `GITHUB_TOKEN` automatically links the new package to this repository. In **thomasluizon > Packages > orbit-node-base > Package settings > Manage Actions access**, confirm `orbit-ui-mobile` has at least **Read** access, including Dependabot. If access is absent, add that repository with **Read** access; the refresh also needs its publishing **Write** access. An authenticated PR image build, including one triggered by Dependabot, proves the read grant. No personal token or Dependabot secret is needed. See GitHub's [workflow package access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#ensuring-workflow-access-to-your-package) documentation. GitHub's [package billing](https://docs.github.com/en/billing/concepts/product-billing/github-packages#package-downloads-by-github-actions) documentation states that downloads authenticated with `GITHUB_TOKEN` do not count against package data transfer usage, so shared runner IPs do not consume an anonymous ECR allowance.

`test.yml` builds an unpushed image on pull requests and checks the health route in a container. Web releases use `release.yml` through `workflow_dispatch` from `main`. Choose `production` for `main`, `production-redesign` for `redesign/main`, or `staging` and enter the branch to release. The workflow resolves that branch's head, builds with the matching repository `NEXT_PUBLIC_*` variables, and pushes the image. Each production target refuses any other source branch before building. The production targets both use the `production` environment's Render API key; staging uses its own environment's key. Each release job deploys the selected digest and waits for that deploy to reach `live` before checking `/api/health` and recording a GitHub Deployment. Production checks both the service URL and public host; redesign production checks its own Render service URL; staging checks the public staging URL. Redesign production reuses the production build variables and records its verified Render URL under the separate GitHub Deployment environment `production-redesign`. For `production`, the smoke job then uploads a Playwright report.

If `RENDER_WEB_SERVICE_ID` is absent during the first production release, the workflow pushes the image, records its digest in the job summary, and fails with the missing service ID. Create the production image-backed Render service from that digest, then set `RENDER_WEB_SERVICE_ID` in **Settings > Secrets and variables > Actions > Variables** and rerun the release. The service's existence and a successful release with a matching health commit prove the setting took effect.

Production releases require `https://<PRODUCTION_WEB_HOST>/api/health` to return the deployed SHA and healthy status. An unreachable host, missing health route, or different SHA fails the deploy job. The smoke job runs against the public host, and the GitHub Deployment URL points there. The web proxy redirects the Render service host to the public site, so a release never smoke-tests a different host than the one people use.

The Render API request uses `POST /v1/services/{serviceId}/deploys` with `imageUrl` set to `ghcr.io/thomasluizon/orbit-web@sha256:...`. Each job reads the deploy ID from Render's HTTP 201 response to that request, checks that the response names the same image reference, and polls that deploy. Any other response status fails the job, because an HTTP 202 (queued) response has no body and so cannot name the deploy the release created. A later deploy that supersedes this one leaves it `canceled`. Both jobs accept Render's `live` status and fail on terminal failure statuses, `canceled` included.
