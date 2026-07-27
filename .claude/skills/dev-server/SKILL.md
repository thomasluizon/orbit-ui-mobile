---
name: dev-server
description: Bring up the full Orbit local stack for manual/visual testing — Docker Postgres, then the orbit-api .NET backend, then the web dev server — in dependency order with readiness gates. Use when the user wants to run the app locally, start the dev server, spin up the local stack, or view web changes in a browser.
argument-hint: "[web-only | up | down | status]"
---

# Dev Server — full local Orbit stack

Brings up the three tiers **in order, each gated on the previous being ready**: Docker Postgres → `orbit-api` (.NET) → web (`npm run web`). Launch the long-running processes in the background so they persist across turns, then report the URLs.

## Paths & ports (verified)

| Tier | Where | Command | URL / port |
|---|---|---|---|
| DB | Docker container `orbit-postgres` (`postgres:17`) | `docker start orbit-postgres` | `localhost:5432` |
| API | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` | `dotnet run --project src/Orbit.Api` | http://localhost:5000 |
| Web | current Orbit UI checkout | `npm run web` | `http://localhost:<worktree web port>` |

- DB connection (from `appsettings.Development.json`): `Host=localhost;Port=5432;Database=orbit;Username=postgres;Password=postgres`.
- Read the web port before starting or checking web: `node tools/orca-web-port.mjs`. A linked worktree with no assignment is an error, not a fallback to 3000. The root checkout still reports 3000.
- Web→API wiring needs nothing: the BFF proxy reads `API_BASE` and defaults to `http://localhost:5000`. The web-port runner preserves that local API base on every assigned web port. **Only** intervene if `apps/web/.env*` sets `API_BASE` to a non-localhost value (then the local web would hit prod) - warn the user, don't edit their `.env`.
- The database and API remain shared across worktrees at 5432 and 5000. This skill isolates only the web server port.

## Mode (from `$ARGUMENTS`)

- `down` → jump to **Stop**.
- `status` → jump to **Status**.
- `web-only` → skip DB+API (assume already up or pointed at prod); run only **Step 4**.
- empty / `up` → run all steps.

## Step 1 — Docker Postgres

1. Confirm Docker is up: `docker info` (>/dev/null). If it errors, tell the user to start Docker Desktop and stop.
2. Start the existing container, creating it only if absent:
   ```bash
   docker start orbit-postgres 2>/dev/null || docker run -d --name orbit-postgres \
     -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbit \
     -p 5432:5432 postgres:17
   ```
3. Gate on readiness (loop, ~30s budget): `docker exec orbit-postgres pg_isready -U postgres` until it prints `accepting connections`.

## Step 2 — Migrations

Normally a no-op: the API **auto-applies migrations on startup** in Development (Step 3), so skip this. Only run a manual apply if you need the schema current before booting the API — and note `dotnet ef` does NOT load `appsettings.Development.json` (it reads the empty base `appsettings.json`), so you MUST pass the connection string explicitly:
```bash
cd "C:/Users/thoma/Documents/Programming/Projects/orbit-api"
dotnet ef database update --project src/Orbit.Infrastructure --startup-project src/Orbit.Api \
  --connection "Host=localhost;Port=5432;Database=orbit;Username=postgres;Password=postgres"
```
(Plain `dotnet ef database update` fails with "ConnectionString property has not been initialized" — that's the missing `--connection`, not a real error.)

## Step 3 — API (background, gated)

```bash
cd "C:/Users/thoma/Documents/Programming/Projects/orbit-api"
dotnet run --project src/Orbit.Api
```
Launch it with `run_in_background: true`. Then gate on health: poll `http://localhost:5000/health` until 200 (the XpAwardLog backfill runs on first startup — allow ~60s). Do not proceed to web until the API answers.

## Step 4 — Web (background, gated)

```bash
cd "<the worktree you are testing>"
npm run web
```
First run `node tools/orca-web-port.mjs` and save the reported value as `<web-port>`. Launch with `run_in_background: true`. Gate on `http://localhost:<web-port>` returning HTML. `npm run web` = `turbo run dev --filter=@orbit/web` (Next dev), so it serves only the web app, not Expo.

## Report

Print the live URLs and what's running:
```
DB   localhost:5432   (docker: orbit-postgres)
API  http://localhost:5000   (/scalar for docs, /health)
Web  http://localhost:<web-port>   ← open this
```
Tell the user the web port and that it proxies to the shared local API by default. The API + web run in background tasks; their logs stream to their task output files.

## Status

Run `node tools/orca-web-port.mjs` for `<web-port>`, then use `docker ps --filter name=orbit-postgres` for the DB; check `http://localhost:5000/health` and `http://localhost:<web-port>`. Report which tiers are up.

## Stop

- Kill the background API + web tasks (TaskStop on their task ids, or close the shells).
- Stop the DB only if asked: `docker stop orbit-postgres` (keep the container so data + next `docker start` are instant; never `rm` it unless the user asks).
