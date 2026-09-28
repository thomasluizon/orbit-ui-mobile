# Web image deployment

> **At a glance** - `Dockerfile` builds the web workspace into a standalone Next.js image. The integration branch publishes and deploys staging; the manual workflow publishes and deploys production after GitHub Environment approval.

The image lives at `ghcr.io/thomasluizon/orbit-web`. Both workflows tag it with the source commit SHA and branch name, then deploy the immutable digest. Render services `orbit-web-staging` and `orbit-web` must be image-backed web services configured to pull this GHCR image. Give each service a GHCR registry credential, set port `3000`, and check `/api/health`. The image runs `node server.js` as the `orbit` user. The image carries `WEB_COMMIT_SHA`; the health response includes that SHA so the workflows can verify the served build.

## GitHub settings

In repository **Settings > Secrets and variables > Actions**, set the repository secrets `RENDER_API_KEY`, `SMOKE_TEST_EMAIL`, and `SMOKE_TEST_CODE`. The smoke credentials must belong to the dedicated production smoke account. Set these repository variables:

| Variable | Purpose |
| --- | --- |
| `RENDER_WEB_STAGING_SERVICE_ID` | Render service ID for `orbit-web-staging` |
| `RENDER_WEB_SERVICE_ID` | Render service ID for `orbit-web` |
| `PRODUCTION_WEB_HOST` | Production hostname, without `https://` or a path |
| `PRODUCTION_WEB_CUTOVER` | Set to `true` when `PRODUCTION_WEB_HOST` moves to Render; leave unset before the cutover |
| `STAGING_NEXT_PUBLIC_SUPABASE_URL`, `PRODUCTION_NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PRODUCTION_NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase publishable key |
| `STAGING_NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `PRODUCTION_NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public push key |
| `STAGING_NEXT_PUBLIC_EVENT_API_BASE`, `PRODUCTION_NEXT_PUBLIC_EVENT_API_BASE` | Browser reachable API origin for event streaming |
| `STAGING_NEXT_PUBLIC_SITE_URL`, `PRODUCTION_NEXT_PUBLIC_SITE_URL` | Web origin for metadata |
| `STAGING_NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `PRODUCTION_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `STAGING_NEXT_PUBLIC_SENTRY_DSN`, `PRODUCTION_NEXT_PUBLIC_SENTRY_DSN` | Public browser Sentry DSN |

These `NEXT_PUBLIC_*` values are embedded during the image build. Set server-only values such as `API_BASE`, Sentry server configuration, and auth credentials in **Render Dashboard > service > Environment**. Do not pass them as Docker build arguments. The Render services must have their own environment settings before deployment.

In **Settings > Environments > production**, require the owner's review. The `deploy-web.yml` job uses that environment, so its build and deployment await approval. Keep the production service's automatic deploy setting disabled. The staging service also uses explicit API deployments, so it does not need registry-triggered automatic deploys.

In **Settings > Branches > main > Branch protection**, remove the retired `Post-deploy smoke (required)` check if it is listed as required. The production smoke suite now runs as the final job of the manual release workflow and fails that run when a core flow fails.

## Workflows

`web-image.yml` builds an unpushed image on relevant pull requests and checks the health route in a container. On an integration branch push it publishes the image, records the digest in the job summary, deploys that digest to staging through the Render API, waits for `live`, and verifies the commit SHA at the Render service URL. Change its `INTEGRATION_BRANCH` value when the integration branch moves; the push trigger already includes both candidate branches.

`deploy-web.yml` is manual only. Choose a Git ref, approve the `production` environment, and it builds from that ref with production public values. After the Render deploy reaches `live`, it verifies the SHA from `/api/health` at the service's Render URL. Before the DNS cutover, an unreachable public host or one without a health route does not block the release, but a different reported SHA does. The job summary says the public host was not verified because the cutover has not happened. The GitHub Deployment payload records the selected ref, resolved SHA, image digest, and the verified URL. That URL is the Render service URL until the public host reports the same SHA. The smoke job uses the Render origin and uploads its Playwright report.

At the DNS cutover, set the repository variable `PRODUCTION_WEB_CUTOVER` to `true` in **Settings > Secrets and variables > Actions > Variables**. The release then requires `https://<PRODUCTION_WEB_HOST>/api/health` to return the deployed SHA and healthy status. An unreachable host, missing health route, or different SHA fails the deploy job. The smoke job runs against the public host, and the GitHub Deployment URL points there. A successful release with a public host verification in its job summary and a smoke job targeting that host proves the setting took effect.

The Render API request uses `POST /v1/services/{serviceId}/deploys` with `imageUrl` set to `ghcr.io/thomasluizon/orbit-web@sha256:...`. A created response supplies the deploy ID. A bodyless queued response makes the workflow list recent deploys and find the matching image reference before polling. The workflow accepts Render's `live` status and fails on terminal failure statuses.
