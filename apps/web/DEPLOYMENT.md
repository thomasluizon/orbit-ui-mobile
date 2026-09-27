# Web image deployment

> **At a glance** - `Dockerfile` builds the web workspace into a standalone Next.js image. The integration branch publishes and deploys staging; the manual workflow publishes and deploys production after GitHub Environment approval.

The image lives at `ghcr.io/thomasluizon/orbit-web`. Both workflows tag it with the source commit SHA and branch name, then deploy the immutable digest. Render services `orbit-web-staging` and `orbit-web` must be image-backed web services configured to pull this GHCR image. Give each service a GHCR registry credential, set port `3000`, and check `/api/health`. The image runs `node server.js` as the `orbit` user.

## GitHub settings

In repository **Settings > Secrets and variables > Actions**, set the repository secret `RENDER_API_KEY`. Set these repository variables:

| Variable | Purpose |
| --- | --- |
| `RENDER_WEB_STAGING_SERVICE_ID` | Render service ID for `orbit-web-staging` |
| `RENDER_WEB_SERVICE_ID` | Render service ID for `orbit-web` |
| `PRODUCTION_WEB_HOST` | Production hostname, without `https://` or a path |
| `STAGING_NEXT_PUBLIC_SUPABASE_URL`, `PRODUCTION_NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PRODUCTION_NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase publishable key |
| `STAGING_NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `PRODUCTION_NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public push key |
| `STAGING_NEXT_PUBLIC_EVENT_API_BASE`, `PRODUCTION_NEXT_PUBLIC_EVENT_API_BASE` | Browser reachable API origin for event streaming |
| `STAGING_NEXT_PUBLIC_SITE_URL`, `PRODUCTION_NEXT_PUBLIC_SITE_URL` | Web origin for metadata |
| `STAGING_NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `PRODUCTION_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `STAGING_NEXT_PUBLIC_SENTRY_DSN`, `PRODUCTION_NEXT_PUBLIC_SENTRY_DSN` | Public browser Sentry DSN |

These `NEXT_PUBLIC_*` values are embedded during the image build. Set server-only values such as `API_BASE`, Sentry server configuration, and auth credentials in **Render Dashboard > service > Environment**. Do not pass them as Docker build arguments. The Render services must have their own environment settings before deployment.

In **Settings > Environments > production**, require the owner's review. The `deploy-web.yml` job uses that environment, so its build and deployment await approval. Keep the production service's automatic deploy setting disabled. The staging service also uses explicit API deployments, so it does not need registry-triggered automatic deploys.

In **Settings > Branches > main > Branch protection**, remove the retired `Post-deploy smoke (required)` check if it is listed as required. The old Vercel smoke workflow no longer runs.

## Workflows

`web-image.yml` builds an unpushed image on relevant pull requests and checks the health route in a container. On an integration branch push it publishes the image, records the digest in the job summary, deploys that digest to staging through the Render API, and waits for `live`. Change its `INTEGRATION_BRANCH` value when the integration branch moves; the push trigger already includes both candidate branches.

`deploy-web.yml` is manual only. Choose a Git ref, approve the `production` environment, and it builds from that ref with production public values. After the Render deploy reaches `live`, it checks `https://<PRODUCTION_WEB_HOST>/api/health` and creates a GitHub Deployment whose payload records the selected ref, resolved SHA, and image digest.

The Render API request uses `POST /v1/services/{serviceId}/deploys` with `imageUrl` set to `ghcr.io/thomasluizon/orbit-web@sha256:...`; the response's `id` identifies the deploy to poll. The workflow accepts Render's `live` status and fails on terminal failure statuses.
