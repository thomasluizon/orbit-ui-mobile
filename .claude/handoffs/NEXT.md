/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it now keeps each file's mode), update the session line in `open-log.sh`, and read `prev-sleep-decisions-a90b6bd3.md` (D1 to D29 of this chain's third session), then `prev-sleep-decisions-e4903a0b.md` and `prev-sleep-decisions-d1f67ba9.md`. Run `carry-out.sh` after every few decisions and before any relay. Research launches have no network: save ticket text and PR data into the scratchpad before ordering them. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. If an MCP is disconnected, tell the owner to fix it.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports `#1621` to `#1630`, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 88, placed 88, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm a waiter for every open pull request below that waits on CI or review.

| Item | Disposition |
| --- | --- |
| `#1629` / `#1630` (Sentry) | Filed, no worker yet. Launch both first (ui, deep). Evidence is in the ticket bodies; read events through the Sentry MCP. |
| `#1621` UI1954 | Approved at `b5cca475`; `Guards` still red on `dompurify` GHSA-cg2g-xh64-v4q7 and the Expo SDK 57 patch set (ticket comment). Review-batch round on `fix/ticket-1621-next-sentry-advisories`, push once, merge, then the production web release carrying `#1588` and `#1621`. Every other UI publication waits on this. |
| API `316877ab` | `#1616` merged on top of `#1622`'s `5d6c05d1`. Release staging, then production; verify `/health`. Then the Search Console recrawl for `#1622` (the coordinator's browser step only if no MCP covers it), and re-check `https://www.google.com/s2/favicons?domain=useorbit.org&sz=128`. |
| `#1617` | Unblocked (`#1615` and `#1616` merged). Launch after the Sentry pair; coordinate with `#1627`. |
| `#1618` UI1955 | Head `71048edb`; CI red on Unit Tests, Workspace unit (shared), Authed Today Lighthouse budget and Guards. Read the failed logs, review-batch round after `#1621` lands, copy approval, push once. |
| `#1619` | Starts after `#1616` deploys; pre-empt the drawing question the way `#1618`'s ticket comment settled it (run-authored amendment from existing primitives). |
| `#1607` UI1946 | Local `9a9e3956` (worker changed tests only, judging 28 cases stale after the named Astra controls). Read that diff against the ticket and canvas; a spec edit must match a drawing, never a weaker bound. Rebuild and rerun the 11 owning layout files at root (PORT and LAYOUT_PORT 3100), then publish once. |
| `#181` UI1903 | Final rendered proof PASS 39 of 39 on `f9db8d38`. Publish once after `#1621` lands. Then `#1611` UI1944 (owner asked): merge main, check the script byte cap, review. |
| `#1609`, `#222` UI1896, `#1564` UI1897 | Root-proven local carries; publish each once after `#1621` lands (details in Current state source packets). |
| `#1612` | Runner re-pinned to `5b9dd63f` with a fresh configured test-account binding; last run REFUSED_PRECONDITION `CONVERSATION_RECORDING_UNAVAILABLE` (no paid call). Enable `astra_conversation_recording` for the staging test account through `/flag` with before and after listings, re-pin the runner to the staging commit then live, and run it at root. Close only on PASS. |
| `#418` | Stryker survivors still unreviewed; unchanged from the spec packet. |
| `#1623` to `#1626` | Owner orders, filed. Start `#1623` early (owner asked twice). |
| UI1953 | This handoff's docs PR (branch `chore/prod-release-relay-1616`); merge after `#1621` lands. Dependabot UI1915/1916/1930/1932 and UI1952 stay sequential. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows above, Sentry and `#1621` first.
3. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh` (a heredoc that names the worker engine trips the launch guard, so write the entry to a file and pipe it in). Keep a live wake source while work remains: only the launcher and `tools/wait-ci.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, a 75-minute hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Redirects use literal paths. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit`, with the local merge-result check when the base moved onto a shared file. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above.
- API849 `#1615`: done, merged as `5b9dd63f`, live on staging and production.
- API848 `#1616`: done, merged as `316877ab` (round 3 fixed three P1 threads; a root fix cleared SonarCloud S8733); release carried.
- `#1617` to `#1620`: `#1618` published as UI1955 (carried, red); `#1617` and `#1619` carried; `#1620` last.
- `#1612` acceptance: carried with the new precondition above.
- UI main carrying `#1588` releases: carried, folded into the `#1621` production web release.
- `#1609`, `#222`, `#1564`, `#181`: carried, publication held behind `#1621` (Guards).
- `#1607`: advanced to local `9a9e3956`; carried.
- `#418`, Dependabot, UI1952, `#1611`, `#1613`, landing `#272`, runbook 7 and 12, phone checks: carried; runbook 7 is now `#1626`, the Play/brand/email scope is now `#1623` to `#1625`.
- Workers, waiters, session chain: superseded by the In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
