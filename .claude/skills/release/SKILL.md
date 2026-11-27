---
name: release
description: Start the Orbit release train at once, or plan and run a branch-selected staging release. The driver runs the same train every 4 hours by itself.
argument-hint: "[staging <branch>] [--track open|production]"
effort: high
---

# Release

The driver releases every platform together on a steady cadence: the release train. A train starts when a service has unreleased work and the previous train ended at least 4 hours ago. It releases each service to staging first and then to production, in the order API, web, landing, then mobile (Android, then iOS). `/release` starts the same train at once. Planning is read-only. Never dispatch a service whose plan says `needsRelease: false`. Stop after a failed release or a failed verification. Read `reference.md` in this folder for the release facts.

## The train

The code of the train is `tools/lib/release-train.mjs`. It uses the tools and the rules of this skill: `tools/release-plan.mjs` for the plan and the planned SHA, the exact `dispatchCommand`, `tools/wait-release.mjs` for each run and the live commit, and the verifications below.

- `/release` with no argument runs `node tools/drive.mjs --release-now`. The driver starts the train on its next tick, within 2 minutes. Cadence and the last stop do not hold it.
- `node tools/drive.mjs --release-status` prints the newest train: what it released and where it stopped.
- `node tools/drive.mjs --dry-run` prints each step that the train would take.
- Each tick makes at most one dispatch or one check. The state is the file `release-train.json` in the driver state directory. A restart resumes the train and never dispatches a step twice.
- Production of a service starts only after staging serves the planned commit with a healthy status.
- A failed dispatch, a failed run, a failed verification or a `wait-release.mjs` ceiling stops the train at that service. Later services do not start. The driver files one Bug ticket with the run link, the step and the error.
- A refusal for a missing green Tests or Guards run gets one more release dispatch. If the planned commit has green runs on `main`, the train dispatches no tests. If it has no green runs and `main` is at that commit, the train dispatches `test.yml` and `guards.yml` and waits for both. If `main` moved, the train waits for the runs at that commit.
- When no commit qualifies for web or mobile, the train skips that service and releases the others. Any other unreadable baseline starts no train.
- An API release with a migration, or with a Terraform step under `## Manual steps`, holds only the API step. The driver cannot take a Render export. It files one `needs:owner` ticket that names the step, and the train goes on with the other services.
- Mobile skips when no file under `apps/mobile` or `packages/shared` changed since the newest mobile production record. Web skips when no `apps/web` or `packages/shared` file changed since the served commit.
- Sleep mode changes nothing for the train.

Run the steps below by hand only for a branch-selected staging release, or when the owner asks for one service.

## Plan

Production uses `node tools/release-plan.mjs`, with `--track production` when the owner asks for it. Staging needs a branch: `node tools/release-plan.mjs --environment staging --branch <branch>`. Staging Android uses `internal`.

Web and Android on `main` plan the newest of the last 100 `main` commits that has green `test.yml` and `guards.yml` push runs. iOS builds the Android commit. API, landing and a staging plan of another branch use the head of the branch.

Show for each service:

- the branch, the deployed SHA or absent baseline, the planned SHA (`plannedSha`) and the pinned `dispatchCommand`;
- the unreleased commits and the Android track with its baseline.

Both release workflows refuse a SHA without a green Tests run and a green Guards run. After a refusal, dispatch `test.yml` and `guards.yml` on the branch, then dispatch the release again. An empty plan ends with no dispatch. Stop on a divergent production comparison or a remote read failure. For staging, show `deployedFromOtherBranch` when the live commit is outside the selected branch.

## Dispatch in plan order

Keep the reviewed plan and its full planned SHA for each repository until verification ends. A branch that advances after the plan does not change the selected commit. For a newer commit, plan again. Production selects `main`. Staging uses the required branch.

For API, web and landing, run the manual `release.yml` of each repository from `main`. Use the exact `dispatchCommand` of the plan. Staging needs a full 40-character SHA. Always pass the planned SHA.

```text
gh workflow run release.yml --repo thomasluizon/<repo> --ref main -f environment=<production|staging> -f branch=<selected branch> -f sha=<planned SHA>
```

Production needs staging to serve the same commit with healthy status. Web and Android also need green PR Tests and Guards at the selected SHA. The train never bypasses staging admission. Add `-f force_unstaged=true -f override_reason="<reason>"` to a hand dispatch only when the owner asks for it.

`gh workflow run` returns no run id. Record the dispatch time and the `main` SHA. List the recent runs and select the unique new run with that `main` SHA. If no unique run matches, stop.

```text
gh run list --repo thomasluizon/<repo> --workflow release.yml --branch main --limit 10 --json databaseId,headSha,createdAt,event,status,conclusion,url,displayTitle,headBranch
node tools/wait-release.mjs --repo <api|ui|landing> --run <databaseId> --sha <planned SHA> --workflow-sha <main workflow SHA> --service-url <selected service origin>
```

The waiter checks the live commit against the planned SHA after the run succeeds. A missing, unhealthy or different commit fails the check. A ceiling result leaves the release unresolved, so do not dispatch the next service.

After success, verify the live service:

- API: `/health` reports `status: Healthy` and the planned SHA.
- Web: `/api/health` reports `status: ok` and the planned `commit`.
- Landing: a successful GitHub Deployment exists for the planned SHA, and the `orbit-build` meta tag equals the SHA.

Stop with the run URL and the observed value on a mismatch.

## Desktop with web

The UI `release.yml` runs the desktop release for both environments. Do not dispatch a separate Desktop Release during `/release`. A failed desktop check stops the web release. Read the Desktop summary of the run for the channel and the published or unchanged version.

## Android

Follow `.claude/skills/android-release/SKILL.md` for the version, the `versionCode` and the dispatch. The train uses mobile staging (Android track `internal` and iOS variant `staging`) and then mobile production (Android track `open` and iOS variant `production`), always from `main`. The train never uses Android track `production` and never submits to the App Store. The launch ticket owns those. A hand release can use `production` only when the owner asks. Staging by hand uses only `internal`, from the selected branch. Then run `.claude/skills/ios-release/SKILL.md` at the same version.

Before a staging Android dispatch, the staging API must be healthy at the planned API commit. Dispatch with `--ref <selected branch>`. Resolve the unique new run, then run `wait-release.mjs --repo ui --workflow android --run <databaseId> --sha <planned Android SHA>`. A successful upload does not say when Play makes the build available to testers.
