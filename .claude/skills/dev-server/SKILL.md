---
name: dev-server
description: Start the full local Orbit stack for manual and visual tests: Docker Postgres, the orbit-api backend, then the web dev server, each gated on the one before. Use to run the app locally, start the dev server or view web changes in a browser.
argument-hint: "[web-only | up | down | status]"
effort: low
---

# Dev server: the full local Orbit stack

Start the three tiers in order. Gate each tier on the one before it. Start the long processes in the background, then report the URLs.

| Tier | Where | Command | URL or port |
|---|---|---|---|
| DB | Docker container `orbit-postgres` (`postgres:17`) | `docker start orbit-postgres` | `localhost:5432` |
| API | `.claude/orchestrator.json` `repos.api` | `dotnet run --project src/Orbit.Api` | http://localhost:5000 |
| Web | the Orbit UI checkout you test | `npm run web` | `http://localhost:<web-port>` |

- Create the container only when it is absent: `docker run -d --name orbit-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbit -p 5432:5432 postgres:17`. Gate on `docker exec orbit-postgres pg_isready -U postgres` printing `accepting connections`.
- Gate the API on `http://localhost:5000/health` returning 200. Allow about 60 seconds on the first start. The API applies migrations on start in Development. A manual `dotnet ef database update` needs `--connection "Host=localhost;Port=5432;Database=orbit;Username=postgres;Password=postgres"`, because `dotnet ef` does not read the Development settings of the API.
- Read `<web-port>` with `node tools/orca-web-port.mjs` before you start or check web. A linked worktree with no assignment is an error. Gate web on that URL returning HTML.
- The BFF proxy reads `API_BASE` and defaults to `http://localhost:5000`. Read the value with `node tools/orca-web-port.mjs --api-base`. If it is not a localhost value, warn the owner. Never edit the `.env` files.
- The database and the API are shared across worktrees. This skill isolates only the web port.

## Mode (from `$ARGUMENTS`)

- `up` or empty: run all three tiers, then print the URLs and the web port.
- `web-only`: run only the web tier.
- `status`: check `docker ps --filter name=orbit-postgres`, the `/health` URL and the web URL, then report each tier.
- `down`: stop the background API and web tasks. Stop the database with `docker stop orbit-postgres` only when asked. Never remove the container.

## Visual checks

Judge UI by rendered sweeps of staging against `DESIGN.md` and the drawings, but merge and release fixes with no screenshot gate.

Every rendered sweep scrolls each screen to the end and checks that the last element clears the composer divider.
