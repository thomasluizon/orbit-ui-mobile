---
name: release
description: Plan and run Orbit's manual production or branch-selected staging release.
argument-hint: "[staging <branch>] [--track open|production]"
effort: high
---

# Release

Dispatch only after the owner invokes a release. Planning is read-only. Never dispatch a service whose plan says `needsRelease: false`. Keep the order API, web, landing, Android. Stop after a failed release or a failed verification. Read `reference.md` in this folder for the release facts.

## Plan

Production uses `node tools/release-plan.mjs`, with `--track production` when the owner asks for it. Staging needs a branch: `node tools/release-plan.mjs --environment staging --branch <branch>`. Staging Android uses `internal`.

Show for each service:

- the branch, the deployed SHA or absent baseline, the planned SHA (`plannedSha`) and the pinned `dispatchCommand`;
- the unreleased commits and the Android track with its baseline;
- `releaseCi` for web and Android: the PR Tests and Guards runs at the planned SHA.

When `releaseCi` is not `success`, web has no `dispatchCommand`. Wait for `pending`. For `missing` or `failed`, dispatch `test.yml` and `guards.yml` on the branch, then plan again. Dispatch Android only at `success`. An empty plan ends with no dispatch. Stop on a divergent production comparison or a remote read failure. For staging, show `deployedFromOtherBranch` when the live commit is outside the selected branch.

## Dispatch in plan order

Keep the reviewed plan and its full planned SHA for each repository until verification ends. A branch that advances after the plan does not change the selected commit. For a newer commit, plan again. Production selects `main`. Staging uses the required branch.

For API, web and landing, run the manual `release.yml` of each repository from `main`. Use the exact `dispatchCommand` of the plan. Staging needs a full 40-character SHA. Always pass the planned SHA.

```text
gh workflow run release.yml --repo thomasluizon/<repo> --ref main -f environment=<production|staging> -f branch=<selected branch> -f sha=<planned SHA>
```

Production needs staging to serve the same commit with healthy status. Web and Android also need green PR Tests and Guards at the selected SHA. Add `-f force_unstaged=true -f override_reason="<reason>"` to the web dispatch only when the owner asks to bypass staging admission.

`gh workflow run` returns no run id. Record the dispatch time and the `main` SHA. List the recent runs and select the unique new run with that `main` SHA. If no unique run matches, stop.

```text
gh run list --repo thomasluizon/<repo> --workflow release.yml --branch main --limit 10 --json databaseId,headSha,createdAt,event,status,conclusion,url,displayTitle,headBranch
node tools/wait-release.mjs --repo <api|ui|landing> --run <databaseId> --sha <planned SHA> --workflow-sha <main workflow SHA> --service-url <selected service origin>
```

The waiter checks the live commit against the planned SHA after the run succeeds. A missing, unhealthy or different commit fails the check. A ceiling result leaves the release unresolved, so do not dispatch the next service.

After success, verify the live service:

- API: `/health` reports `status: Healthy` and the planned SHA. For production, the Render live deploy commit also equals the planned SHA.
- Web: `/api/health` reports `status: ok` and the planned `commit`.
- Landing: a successful GitHub Deployment exists for the planned SHA, and the `orbit-build` meta tag equals the SHA.

Stop with the run URL and the observed value on a mismatch.

## Desktop with web

The UI `release.yml` runs the desktop release for both environments. Do not dispatch a separate Desktop Release during `/release`. A failed desktop check stops the web release. Read the Desktop summary of the run for the channel and the published or unchanged version.

## Android

Follow `.claude/skills/android-release/SKILL.md` for the version, the `versionCode` and the dispatch. Confirm the exact inputs with the owner first. Production uses `open` by default, or `production` when the owner asks, always from `main`. Staging uses only `internal`, from the selected branch. Then run `.claude/skills/ios-release/SKILL.md` at the same version.

Before a staging Android dispatch, the staging API must be healthy at the planned API commit. Dispatch with `--ref <selected branch>`. Resolve the unique new run, then run `wait-release.mjs --repo ui --workflow android --run <databaseId> --sha <planned Android SHA>`. A successful upload does not say when Play makes the build available to testers.
