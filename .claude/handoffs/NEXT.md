/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it.

Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, update the session line in `open-log.sh`, and read `prev-sleep-decisions-e4903a0b.md` (D1 to D29 of this chain's second session), `prev-sleep-decisions-d1f67ba9.md` (D1 to D14), then the earlier log through D163. Run `carry-out.sh` after every few decisions and before any relay. Research launches have no network: save ticket text and PR data into the scratchpad before ordering them.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 78, placed 78, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm a waiter for every open pull request below that waits on CI or review.

| Item | Disposition |
| --- | --- |
| API849 `#1615` | Published `ba60dfb5` (complete count ranking block). Arm `wait-ci`, drive review and merge, release API, then `#1618` can start. |
| API848 `#1616` | Head `edbb3072`, CHANGES_REQUESTED; round 2 stopped at the 75 minute ceiling with four pushed commits. Read the review and the remaining acceptance list, then a deep round with a recorded `--relaunch-reason` (branch at its cap). Retitle when complete. |
| `#1617` to `#1620` | `#1617` starts after API848 and API849 merge; `#1618` after `#1615` deploys; `#1619` after `#1616` deploys; `#1620` last. |
| `#1612` acceptance | Fix live on staging and production at `fdc5f139`. Read `report-1612-staging-acceptance-prep.md` and `run-1612-staging-acceptance.py` in full, then run at root. Close only on PASS with readback. |
| UI main carrying `#1588` | UI1949 merged as `47d95de1`. Plan and run the production web release and the Android Open release. |
| `#1609` | Local `6cbc0a673`, root Chromium 63 of 63. Compose the body and publish once as a new PR. |
| `#1607` UI1946 | Local carry `4500c8c19`, not pushed. Owning layout lane RED (28 of 254). Diagnose against UI1946 CI and main, deep Codex fix round, publish only when green. |
| `#181` UI1903 | Run `bash run-181-f9db-final-rendered-proof.sh` at root (38 scenarios, 54 attempts), reconcile, publish once. No committed emitted guard (decided). |
| `#222` UI1896 | Local `196abc44` on `main`. Retarget to `main`, compose body from `report-222-main-retarget.md`, push once, fresh review. |
| `#1564` UI1897 | Local `e0306d4c` on `main`. Run the listed layout specs on a fresh build, retarget to `main`, publish once. |
| `#418` | Local `b17b97b0`. Stryker collected: 257 application survivors and an infrastructure exclusion for `AgentOperationExecutor.cs`. Review survivors for the recovery invariants, route real gaps to a deep round, push once. |
| UI1952, Dependabot UI1915/UI1916/UI1930/UI1932 | UI1952 is the new scheduled snapshot. UI1915 rebased to `eca5b8f5`; drive it, then request rebases one at a time for the rest. |
| `#1611` UI1944, `#1613` | `#1611` waits on `#181` script-byte headroom; `#1613` carries into the resolved `#1607` form. |
| Play, brand and code-email scope; landing `#272`; runbook 7 and 12; phone checks | Unchanged; see `### Remaining PRs, assets and delivery`. |
| Workers, waiters, session chain | No worker running at relay. No live waiter. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language.
2. Drive the Astra overhaul rows (API849, API848, then `#1617` to `#1620`).
3. Drive the other in-flight rows above, keeping independently releasable fixes moving.
4. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
5. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh` (a heredoc that names the worker engine trips the launch guard, so write the entry to a file and pipe it in). Keep a live wake source while work remains: only the launcher and `tools/wait-ci.mjs` register one. Keep `LOAD_MAX=60 SPACING=45`, a 75-minute hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane, and a hermetic layout run sets `PORT=3100` and `LAYOUT_PORT=3100`. Background tasks use a 7200000 ms ceiling. Redirects use literal paths. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, shell cautions, helpers, exact-head merge rules, carry and relay procedures: carried above and in the spec.
- File and start the Astra overhaul tickets: done, filed as `#1615` to `#1620` with reconciliation comments on `#24` and `#26`; `#1615` and `#1616` published as API849 and API848.
- UI1951: done, merged as `b33d04f6`.
- API847 `#1612`: merged as `fdc5f139`, released to staging and production; acceptance carried.
- API846: done, merged as `a3d58e4b`.
- UI1949 `#1588`: done, merged as `47d95de1` after a SonarCloud fix; releases carried.
- `#1607`, `#1609`, `#418`, `#181`: advanced as recorded in In flight; remaining steps carried.
- UI1896, UI1897: carried to `main` locally; publication carried.
- UI1938: done, merged as `3b5c79bf`. Dependabot PRs: carried, sequential.
- `#1611`, `#1613`, Play/brand/email scope, landing `#272`, runbook 7 and 12, phone checks: carried unchanged.
- Workers, waiters and session chain: superseded by the current In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
