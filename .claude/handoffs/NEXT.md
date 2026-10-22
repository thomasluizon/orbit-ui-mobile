/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it.

Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, update the session line in `open-log.sh`, and read `prev-sleep-decisions-d1f67ba9.md` (D1 to D14), then the earlier log through D163. Run `carry-out.sh` after every few decisions and before any relay. Research launches have no network: save ticket text and PR data into the scratchpad before ordering them.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 72, placed 72, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet. An external interruption is the only earlier ending.

## In flight

| Item | Disposition |
| --- | --- |
| Astra block-first overhaul | FIRST. Owner order: every Astra answer to ANY prompt leads with one interactive data block and the least text possible, leaner than the Pierre reference. Filed as `#1615` to `#1620` (milestone `562 Astra`, API blocking UI) and placed at the top of Batch 0c; the reconciliation comments are on `#24` and `#26`. Start Codex workers in dependency order. |
| UI1951 | This handoff's docs PR. Drive review and merge. |
| API847 `#1612` | Published `fd0cb4de`. Re-arm its CI waiter, then drive review, merge, API release, then real staging acceptance. |
| API846 | Pullfrog workflow without the Claude fallback, `bd9acae4`. Re-arm its CI waiter, then drive review and merge. |
| UI1949 `#1588` | Published `2f7f5f87` with root web proof in the body. Re-arm its CI waiter. Needs a fresh exact-head review, merge, production web and Android Open release. |
| `#1607` UI1946 | Local `598eb870`, focus fixture proven. Next: main carry with the prepared single-file resolution, parity check, both harnesses, the 11 unrun layout files against the dc995 frozen build, one publication. Details in the spec source packet. |
| `#1609` | Local `57184919`, review findings fixed. Root Chromium commands in `report-1609-review-fixes.md`, then one publication as a new PR. |
| `#418` | Local `b17b97b0` on `thomasluizon/ticket-418-recovery-proof`. Stryker changed-owner acceptance pending (`418-root-mutation-packet/`), then one push and a new API PR. |
| `#181` UI1903 | Combined build `f9db8d38` passed; ownership proof passed with a scratchpad check only. Add a committed emitted-ownership guard, prepare and run the stage 3 flows lane, publish once. |
| `#1611` UI1944, `#1613`, UI1896 `#222`, UI1897 `#1564`, UI1938, Dependabot UI1915/UI1916/UI1930/UI1932 | Unchanged from the spec source packets; drive each through the normal bar after the rows above. |
| Play, brand and code-email scope; landing `#272`; runbook 7 and 12; phone checks | Unchanged; see `### Remaining PRs, assets and delivery`. |
| Workers, waiters, session chain | No worker running at relay. The relay tool stops the predecessor's CI waiters (`stopCiWaiters` in `tools/relay-session.mjs`), so inspect API846, API847 and UI1949 and re-arm a waiter for each pending one. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language.
2. Start the Astra overhaul tickets in dependency order.
3. Drive the in-flight rows above, keeping independently releasable fixes moving.
4. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
5. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh` (a heredoc that names the worker engine trips the launch guard, so write the entry to a file and pipe it in). Keep a live wake source while work remains: only the launcher and `tools/wait-ci.mjs` register one. Keep `LOAD_MAX=60 SPACING=45`, a 75-minute hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Redirects use literal paths. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, shell cautions, helpers, exact-head merge rules, targeted Terraform, carry and relay procedures: carried above and in the spec.
- Codex-only coordinator and the gpt-6-astra coordinator default: superseded. The owner restored `gpt-6.1-sol` as the Codex default and ran the coordinator on Claude; workers and reviews stay on Codex.
- Codex relay compatibility row: superseded. A Claude coordinator relays through the existing successor tool.
- `#1612` first: done to publication (API847); acceptance carried.
- `#418`, `#1607`, `#1588`, `#1609`, `#181`: advanced as recorded in In flight; remaining steps carried.
- `#1611`, `#1613`, UI1896, UI1897, other open PRs, Play/brand/email scope, landing `#272`, runbook 7 and 12, phone checks, local inventory retention: carried unchanged.
- Workers, waiters and session chain: superseded by the current In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
