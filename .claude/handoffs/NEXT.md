/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. The durable carry copies about 10 GiB per session. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Then restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, update the session line in `open-log.sh`, and read `prev-sleep-decisions-fd386e2b.md` (D1 to D28 of this chain's fifth session), then `prev-sleep-decisions-4815bc3d.md`. Run `carry-out.sh` after every few decisions and before any relay. Research launches have no network: save ticket text and PR data into the scratchpad before ordering them. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. If an MCP is disconnected, tell the owner to fix it. A root hermetic layout run uses the carried `run-layout.sh <label> <head> <specs...>` (it bakes `LAYOUT_PORT=3100` into the build). The carried `publish-rb.sh <repo> <pr> <worker log> <label>` merges a review worker's report into the PR body; `threads-md.mjs` and `reconcile.mjs` are carried too. `gated-launch.sh` takes `--allow-subagents` only with a `## UI review sweep` heading in the order.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 90, placed 90 (`#1632` and `#1633` newly placed in Batch 0c, `#1621` closed and removed), unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm a waiter for every open pull request below that waits on CI or review. UI `main` is `547ff309`: every open UI pull request branched before it, so its readiness step merges `main` forward once (Guards and the Authed Today script budget clear there).

| Item | Disposition |
| --- | --- |
| `#1633` (new, first) | Production web `547ff309` post-deploy smoke failed `apps/web/e2e/log-habit.spec.ts:6` at `smoke-adapters.ts:52`: the log request was OK, then the completed row's `habit-status-toggle` was not found. Reproduce first (red-capable command), then launch the ticket (ui, deep). Product defect or stale adapter after `#1588`; no rollback (it would reopen the Next.js RCE). |
| `#1619` UI1958 | Review batch 1 committed `68b8f91a` locally (date scope, stale recap actions; whole suite 27,931 tests pass), NOT pushed. Merge `main` into the branch, reply to and resolve `PRRT_kwDOR5Siws6vYG5G` and `PRRT_kwDOR5Siws6vYG5N`, merge the report into the body with `publish-rb.sh ui 1958 <worker log> 1619rb1` (the log path is the `logFile` field in the carried `launch-1619-rb1.out`), read the SonarCloud red at the old head, push once. Closes only after `#1631` deploys and its UI consumer lands. |
| `#1617` api#853 | APPROVED at `066cddb5`, 0 threads; red only on SonarCloud (74.5% coverage on new code). Review batch 2 adds tests for the uncovered composition lines (read SonarCloud's new-code list), never an exclusion. Composition stays seeded off until `#26`. |
| `#1627` api#854 | APPROVED at `69ea5a3c`, 0 threads; `Mutation (domain-habit-update-freeze)` cancelled at its time limit, rerun requested on run 39855932413. Read the rerun; if it cancels again, fix the cause. Shares `ProcessUserChatCommand.Tools.cs` with api#853: D115 merge-result build and test before the second merge. Then staging and production API releases. |
| `#1631` api#855 | APPROVED at `1e8a5d74`, 0 threads; red on the OpenAPI Breaking-Change Gate and three compatibility streams (`ReadBlockCardGamificationCard` added to the `/api/Chat/reads/refresh` `block` anyOf) and on the timing test `GoogleAuthFirstLoginRaceTests`. Review batch 1 (launch 2): keep the refresh contract unchanged for clients that never asked for the kind (spec rule 96), the way `#1615`'s `habitRanking` passed the gate; never relax the gate. |
| `#1632` api#856 | All CI green; one P1 thread `PRRT_kwDORKgXhc6vYj7l` (`MarketingController.cs:57`: the route's Content-Security-Policy blocks the reused shell's resources). Review batch 1 (launch 2): allow exactly those resources on that route. |
| `#1628` UI1959 | CHANGES_REQUESTED at `c320ba3b`: `PRRT_kwDOR5Siws6vYn-z`, `PRRT_kwDOR5Siws6vYn-4`, `PRRT_kwDOR5Siws6vYn-_`, plus its own reds (Upgrade layout geometry, Layout shard 1, Web unit jsdom 1/2, Workspace unit shared and mobile). Review batch 1 (launch 2) merges `main` first, fixes all, runs the whole jsdom, shared and mobile suites. It enables React Native's Android key-event flag, so it needs the next native build. |
| `#1624` UI1960 | Delivered (11 files of stale navy/violet/Rubik text). Merge `main` forward, wait for review. The thomas-brain consolidation and social drafts stay root work: thomas-brain's untracked `orbit/brand/` holds a newer headline banner set and archives the scratch launch set as `previous-banners/`; choose the canonical set from what the live profiles show. |
| `#1629` UI1957, `#1630` UI1956 | Both APPROVED at their heads (`3d0cb1c7`, `58f8afd0`); red only on Guards and the script budget, which clear on `main`. Merge `main` forward, push once, re-review, merge, then production web. |
| `#1618` UI1955 | APPROVED at `71048edb`; after the `main` merge, its own red is shared function coverage 95.9% (`ranking-core.ts`, a 0% list-core file): review batch. |
| `#1607` UI1946, `#1564` UI1897, `#181` UI1903, `#1609`, `#222` UI1896, `#1611` UI1944 | Root-proven local carries unchanged (`9a9e3956`, `e0306d4c`, `013ab518`, `6cbc0a67`, `196abc44`; UI1944 published `4768d4ec`). Publish each once, after a `main` merge: `#1607` replies to and resolves `PRRT_kwDOR5Siws6vAkFJ` and uses `pr-1946-body.md`; `#1564` retargets UI1897 to `main` with `report-1564-main-retarget.md`; `#222` retargets UI1896. The script-size cap no longer orders them (797276 bytes on the new base). |
| `#1625` | Merged and live in production (`b8a3a4a8`); stays open for the Gmail app Copy code chip on a real received email, which only the owner's next sign-in shows. |
| `#1626` | Audit merged (api `6db1bda1`); the flag stays for the web cookie route. Staging listing waits on the owner question. |
| `#1622` | Google's s2 favicon for `useorbit.org` still serves the old purple planet; the apex serves the new icons. Re-check later; no other action. |
| `#1612`, `#1623`, `#418`, `#1613`, `#1620` | Unchanged from the spec; `#1612` blocked on the owner question; `#1623` root work after the PR pipeline settles. |
| Android | `main` `547ff309` has unreleased Android changes (`#1588` and more): an Open release follows the android-release skill after the `#1629`/`#1630`/`#1633` fixes land. |
| UI1953 | This handoff's docs PR (branch `chore/prod-release-relay-1616`); merge `main` forward, then merge. Dependabot UI1915/1916/1930/1932 and UI1952 stay sequential. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows above, `#1633` first, then the approved PRs that only need a `main` merge.
3. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh` (write the entry to a file and pipe it in; redirects use literal paths). Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, a 75-minute hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit`, with the local merge-result check when the base moved onto a shared file. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above.
- "A worker must not file tickets": superseded; `tools/compose-prompt.mjs` tells workers to file findings through `create-ticket.mjs` and no stated rule forbids it, so the coordinator places each new ticket instead.
- `#1621`: done, merged as `547ff309`, released to production web (run 39858507145); the smoke red became `#1633`.
- Script-size cap ordering (`#181` first): superseded; the `#1621` head measured 797276 bytes.
- `#1630`, `#1629`: carried as the `main` merge row. `#1617`, `#1627`: review rounds done (`066cddb5`, `69ea5a3c`), both approved; carried for the remaining reds. `#1625`: done (merged `b8a3a4a8`, production), carried for the phone check. `#1626`: done (merged `6db1bda1`), carried for the staging listing. `#1619`: review round committed, carried for publication. `#1631`: launched, delivered as api#855, carried. `#1618`, `#1607`, `#1564`, `#181`, `#1609`, `#222`, `#1611`: carried. `#1628`: launched, delivered as UI1959, carried. `#1612`, `#1622`, `#1623`, `#1624`, `#418`, `#1613`, `#1620`: carried (`#1624` UI part delivered as UI1960).
- UI1953, Dependabot, UI1952: carried. Workers, waiters, chain: superseded by the In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
