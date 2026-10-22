/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. The durable carry copies about 10 GiB per session. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`: it pins each clean detached scratch worktree HEAD under `refs/orbit-scratch-archive/` before removal and skips dirty trees, branch checkouts and live sessions. Then restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, update the session line in `open-log.sh`, and read `prev-sleep-decisions-4815bc3d.md` (D1 to D24 of this chain's fourth session), then `prev-sleep-decisions-a90b6bd3.md`. Run `carry-out.sh` after every few decisions and before any relay. Research launches have no network: save ticket text and PR data into the scratchpad before ordering them. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. If an MCP is disconnected, tell the owner to fix it. A root hermetic layout run uses the carried `run-layout.sh <label> <head> <specs...>` (it bakes `LAYOUT_PORT=3100` into the build).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports `#1621` to `#1630`, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 89, placed 89 (`#1631` newly placed in Batch 0c), unplaced 0, placed twice 0, placed closed 0. A worker must not file tickets: `#1619`'s worker filed `#1631`; check that the launcher's order still forbids it. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm a waiter for every open pull request below that waits on CI or review.

| Item | Disposition |
| --- | --- |
| `#1621` UI1954 | Head `42132c33`, Pullfrog APPROVED at that exact head, 0 threads, `Guards` green. Red: `Workspace unit (mobile)` in `__tests__/lib/native-design-compatibility.test.ts` (three cases; "Native version mismatch: node_modules/@expo/ui", because the Expo SDK 57 patch moved `@expo/ui` and the audited native version table was not updated), plus `Web unit (chromium 6/8)` (`upgrade.test.tsx` pitch heading geometry, `content-centering-geometry.test.tsx` at 412px; both green at `b5cca475`; the job was rerun at relay). First action: a review-batch round (launch 3 on the branch, so `--relaunch-reason`) that fixes the audited table at root cause and runs the whole mobile suite; read the rerun result and fix the web cases too if they are still red; push once, merge at the approved head, then the production web release carrying `#1588` and `#1621`. Every other UI publication waits on this. |
| Script-size cap | The Authed Today `resource-summary.script.size` budget is 820000; main sits near 819891. `ui#1956` (820158), `#181`, `#1611` and `#1618` are over it. After `#1621`, publish `#181` first (its Move-controller loading correction is the measured headroom source), measure main, then rerun the rest. Never raise the cap without a measured reason. |
| `#1630` UI1956 | Head `58f8afd0` (publicProfile null accepted, Zod issue paths logged without values). Red only on `Guards` (`#1621`) and the script-size cap (above). |
| `#1629` UI1957 | Head from its worker (single-flight BFF refresh across server bundles, ended sessions route to sign-in without a config 401 report; no API change, proven in the body). CI was running at relay. |
| `#1617` api#853 | Delivered (deterministic block-first composition, 12,857 tests). The worker says the composition stays off pending `#26`; read how it is gated against the owner order and the ticket before review. |
| `#1627` api#854 | Delivered (habit semantics in tool schemas, instructions and a server validator; failed creates retryable; 12,912 tests). Overlaps `#1617` in chat files: D115 merge-result check before the second merge. Recorded corpus cases are on `#26`. |
| `#1625` api#852 | Delivered (code in subject and body as one digit run, both locales). Copy approval with `/second-opinion`, then after the staging release a Gmail app phone check (the run cannot observe the chip). |
| `#1626` api#851 | Delivered (docs: the web cookie route still reads `redesign`, so the flag stays; production listing recorded on the ticket; off for everyone). Staging listing waits on the open owner question. |
| `#1619` UI1958 | Delivered (3 commits: focused reads with query-bound recovery, saved metric and day summary figures kept, contract and composition tests; shared function coverage 96.07%). Its worker filed `#1631` (API gap: level-only and achievement-only reads) and asked whether `#1619` waits on it. Decided: UI1958 goes through review and merges on its own bar; the ticket closes only after `#1631` deploys and its UI consumer lands. Launch `#1631` (api). Arm a waiter on UI1958. |
| `#1618` UI1955 | Head `71048edb`. Red: shared function coverage 95.9% (needs 96%; `ranking-core.ts`, a 0% list-core file), the script-size cap, and `Guards` (`#1621`). Review-batch round after `#1621` lands. |
| `#1607` UI1946 | Local `9a9e3956`; root owning lane GREEN 254 of 254 on a fresh build. Body prepared in `pr-1946-body.md`. After `#1621`: reply to and resolve thread `PRRT_kwDOR5Siws6vAkFJ` (fixed by `f0f9c1a0`/`4caddff4`), edit the body, push once. |
| `#1564` UI1897 | Local `e0306d4c`; root layout GREEN 372 passed on a fresh build. After `#1621`: retarget to `main`, compose the body from `report-1564-main-retarget.md`, push once. |
| `#181` UI1903, `#1609`, `#222` UI1896 | Root-proven local carries (`013ab518`, `6cbc0a67`, `196abc44`); publish each once after `#1621` lands (`#181` first, see the cap). Then `#1611` UI1944. |
| `#1628` | Worktree `ticket-1628-preview-items` and note `note-1628.md` ready; the launch was refused by the relay drain. Launch it (default tier). |
| `#1612` | Blocked on the owner question (admin staging Orbit MCP); a database write is not an alternative. |
| `#1622` | Production and staging API live at `316877ab`. Search Console indexing requested for `https://useorbit.org/` (api root is 404, so not requested). Re-check `https://www.google.com/s2/favicons?domain=useorbit.org&sz=128` (old purple planet at request time) and the claude.ai connector icon. |
| `#1623` | Root work (captures, thomas-brain composition source, Play upload); start after the PR pipeline settles. |
| `#1624`, `#418`, `#1613`, `#1620` | Unchanged from the spec. |
| UI1953 | This handoff's docs PR (branch `chore/prod-release-relay-1616`); merge after `#1621` lands. Dependabot UI1915/1916/1930/1932 and UI1952 stay sequential. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows above, `#1621` first.
3. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh` (a heredoc that names the worker engine or a worktree removal trips a guard, so write the entry to a file and pipe it in). Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, a 75-minute hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Redirects use literal paths. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit`, with the local merge-result check when the base moved onto a shared file. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above, with the disk check added.
- `#1629`/`#1630`: done as UI1957 and UI1956; carried for CI and review.
- `#1621`: round 2 pushed and approved; carried with the mobile red.
- API `316877ab`: done, live on staging and production, `/health` Healthy at that commit. Search Console recrawl: apex requested; favicon re-check carried.
- `#1617`: done as api#853; carried for review. `#1627`: done as api#854; carried.
- `#1618`: carried with its read reds. `#1619`: launched; carried.
- `#1607`: root lane green; carried for the single publication. `#181`, `#1609`, `#222`, `#1564`: carried, publication held behind `#1621`; `#1564` root lane now green.
- `#1612`: blocked on the new owner question (no admin staging connection).
- `#418`: carried unchanged. `#1623`: carried as root work. `#1624`: carried. `#1625`, `#1626`: done as api#852 and api#851; carried for review. `#1628`: carried, launch refused by the drain.
- UI1953, Dependabot, UI1952: carried.
- Workers, waiters, session chain: superseded by the In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
