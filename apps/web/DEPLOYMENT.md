# Web image deployment

> **At a glance** - `Dockerfile` builds the web workspace into a standalone Next.js image. The manual release workflow builds and deploys a selected branch to staging or `main` to production.

The image lives at `ghcr.io/thomasluizon/orbit-web`. The release workflow tags it with the source commit SHA, then deploys the immutable digest. Render services `orbit-web-staging` and `orbit-web` must be image-backed web services configured to pull this GHCR image. Give each service a GHCR registry credential, set port `3000`, and check `/api/health`. The image runs `node server.js` as the `orbit` user. The image carries `WEB_COMMIT_SHA`; the health response includes that SHA so the workflows can verify the served build.

## GitHub settings

In repository **Settings > Secrets and variables > Actions**, set the repository secrets `SMOKE_TEST_EMAIL` and `SMOKE_TEST_CODE`. The smoke credentials must belong to the dedicated production smoke account. Create the `production` and `staging` environments in **Settings > Environments**. Restrict each environment's deployment branches to `main`. The `production` environment has no required reviewer. Set the `production` environment secret `RENDER_API_KEY` to the Render API key. Set the `staging` environment secret `RENDER_WEB_STAGING_DEPLOY_HOOK_URL` to the hook for `orbit-web-staging`, found in **Render Dashboard > orbit-web-staging > Settings > Deploy Hook**. After a release to each environment succeeds and `/api/health` reports its selected commit, delete the repository secret `RENDER_API_KEY` from **Settings > Secrets and variables > Actions**. Set these repository variables:

| Variable | Purpose |
| --- | --- |
| `RENDER_WEB_STAGING_SERVICE_ID` | Render service ID for `orbit-web-staging`, used by the release planner |
| `RENDER_WEB_SERVICE_ID` | Render service ID for `orbit-web` |
| `PRODUCTION_WEB_HOST` | Production hostname, without `https://` or a path |
| `STAGING_NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `PRODUCTION_NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Public Google OAuth web client ID |
| `STAGING_NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `PRODUCTION_NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public push key |
| `STAGING_NEXT_PUBLIC_EVENT_API_BASE`, `PRODUCTION_NEXT_PUBLIC_EVENT_API_BASE` | Browser reachable API origin for event streaming |
| `STAGING_NEXT_PUBLIC_SITE_URL`, `PRODUCTION_NEXT_PUBLIC_SITE_URL` | Public web origin for metadata, Google OAuth callbacks, and auth redirects; staging releases also verify `/api/health` at the staging origin |
| `STAGING_NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `PRODUCTION_NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Turnstile site key |
| `STAGING_NEXT_PUBLIC_SENTRY_DSN`, `PRODUCTION_NEXT_PUBLIC_SENTRY_DSN` | Public browser Sentry DSN |

These `NEXT_PUBLIC_*` values are embedded during the image build. Set server-only values such as `API_BASE`, Sentry server configuration, and auth credentials in **Render Dashboard > service > Environment**. Do not pass them as Docker build arguments. The Render services must have their own environment settings before deployment.

Keep automatic deploys disabled on both Render services; releases use explicit digest deployments.

In **Settings > Branches > main > Branch protection**, remove the retired `Post-deploy smoke (required)` check if it is listed as required. The production smoke suite now runs as the final job of the manual release workflow and fails that run when a core flow fails.

## Workflows

`test.yml` builds an unpushed image on pull requests and checks the health route in a container. `release.yml` runs only through `workflow_dispatch` from `main`. Choose `production` for `main`, or choose `staging` and enter the branch to release. The workflow resolves that branch's head, builds with the matching repository `NEXT_PUBLIC_*` variables, and pushes the image. Production refuses another branch before building. Its production job uses the environment API key to deploy the digest, waits for Render to report `live`, verifies `/api/health` at the service URL and public host, and records a GitHub Deployment. Its smoke job then uploads a Playwright report. The staging job sends the digest to the staging service's deploy hook with `imgURL`, waits for the public staging URL's `/api/health` to report the selected commit, and records a GitHub Deployment. Staging does not use the Render API key.

If `RENDER_WEB_SERVICE_ID` is absent during the first production release, the workflow pushes the image, records its digest in the job summary, and fails with the missing service ID. Create the production image-backed Render service from that digest, then set `RENDER_WEB_SERVICE_ID` in **Settings > Secrets and variables > Actions > Variables** and rerun the release. The service's existence and a successful release with a matching health commit prove the setting took effect.

Production releases require `https://<PRODUCTION_WEB_HOST>/api/health` to return the deployed SHA and healthy status. An unreachable host, missing health route, or different SHA fails the deploy job. The smoke job runs against the public host, and the GitHub Deployment URL points there. The web proxy redirects the Render service host to the public site, so a release never smoke-tests a different host than the one people use.

The production Render API request uses `POST /v1/services/{serviceId}/deploys` with `imageUrl` set to `ghcr.io/thomasluizon/orbit-web@sha256:...`. The workflow lists recent deploys, finds the matching image reference, and polls that deploy. It accepts Render's `live` status and fails on terminal failure statuses. The staging deploy hook receives the same image digest in its `imgURL` query parameter; the workflow checks the public health response instead of querying the Render API.
