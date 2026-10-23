/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it copies about 18,000 entries, so run it as a background task), update the session line in `open-log.sh`, and read `prev-sleep-decisions-8d972f8f.md` (D1 to D24 of this chain's seventh session), then `prev-sleep-decisions-a91ceb57.md`. Run `carry-out.sh` after every few decisions and before any relay. Redirects in Bash use literal paths (write a log entry with the Write tool, then pipe it into `log.sh`). Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. Carried helpers: `rb-launch.sh <repo> <issue> <worktree> <base> <note> <stem> <tier> [reason]` composes and gates a review-batch launch; `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]` does the same for a new ticket after `prep-npm.sh`; `review-summary.mjs <repo:pr>...` prints each PR's verdict, review head and unresolved threads without posting a request; `failed-tests.sh <pr>` prints the failing jobs' test lines; `run-layout.sh <label> <head> <specs...>` runs a root hermetic layout lane. Thread ids for `resolve-bot-thread.mjs` must first come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`. Never pipe `list-bot-threads.mjs --re-review` into `head`: the pipe ends the wait early.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 88, placed 88 (`#1635` filed and placed in Batch 0c this session), unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm `tools/wait-ci.mjs` for every open pull request below. UI `main` is `ea102cc9`; API `main` is `3b199d35`. Every UI batch below merged `ea102cc9` into its branch before its single push this session. A Pullfrog review counts only at the exact head and after its push; if CI settles green with only an older review, use `list-bot-threads.mjs --re-review --wait-seconds 1500` as its own background task.

| Item | Disposition |
| --- | --- |
| Production web `ea102cc9` | Live (run 39881388921, health serves it) with `#222`, `#1630`, `#1633`'s log adapter and `#1624`'s docs. Post-deploy smoke failed 2 of 6 at `smoke-adapters.ts:28`: Today hides the create FAB while the account has no habits (`use-today-page.tsx:78`), so `createSmokeHabit` needs the zero-habit path (Get started "Create your first habit") with the FAB path kept for non-empty accounts. First task: a `#1633` worker round on a new branch from `main` with a hermetic zero-habit case proven red on `main`'s adapter and green on the fix, then publish, release production web and rerun the smoke. `#1633` closes only on a 6 of 6 production smoke. |
| `#1630` | Merged and live on web. Read Sentry `ORBIT-WEB-V` (164 events, last 00:09:47Z before the release); close only with no new events and after the Android Open release carries the shared validator. |
| Production API `3b199d35` | Live and Healthy on production and staging. `#1617` stays open: its composition is seeded off until `#26`, and `#1620` is its UI half. |
| ui#1955 `#1618` | `b240fd3d` (root surface inventory fix; harnesses pass). Waits on CI and a fresh exact-head review. |
| ui#1944 `#1611` | `2edf0d1f` (shared prompt-library core for the SonarCloud duplication). Waits on CI, SonarCloud and review. |
| ui#1961 `#1609` | `4832f1fc` (retry parent delta from fresh readback; thread resolved). Waits on CI and review. |
| ui#1959 `#1628` | `4cd2ebe1` (refresh clears discarded drafts; 36 geometry cases fixed; manifest; thread resolved). After merge, the Android Open release carries it with the key-event flag. |
| ui#1946 `#1607` | `6e5ca232` (16 layout specs moved to the #1607 names). CI's layout shards are the proof; a layout red means a root `run-layout.sh` lane on that head first. |
| ui#1958 `#1619` | `8cbcc393` (12 parity dispositions, streak figures restored in the disclosure, parity checker reads optional `productionSnapshots`). After merge, a follow-up PR on `#1619` adds the `gamification` read block consumer through `POST /api/chat/gamification/refresh` (live on production API); `#1619` closes after that ships. |
| ui#1903 `#181` | `5539c3fd` (Move controller kept across list loading; thread resolved; main conflict resolved). Before merge, root runs the 38 whole-app scenarios on a fresh hermetic build of this head: rebind the carried `run-181-f9db-final-rendered-proof.sh` identity constants (head, tree, BUILD_ID, build receipt) to the new build and keep every scenario and assertion. |
| ui#1897 `#1564` | `8be3e663` (week scroll extent, header focus marker, measured geometry instead of two undeclared CSS variables). Waits on CI and review. |
| ui#1963 `#1635` | `7820eff7`, new this session: retires `DesignCookieSync`, Android `DesignFlagGate`, the dormant launch channel and native module. Watch the Android release build check. After it ships to web and Android Open, `#1626` detaches the routing Worker route, lists the flag in both environments and settles the seed. |
| ui#1964 (this docs PR) | Wait for CI and review, then merge. |
| ui#1952 snapshot | Rebaselined to API `3b199d35` (head `03c81672`). Merge on green with a fresh exact-head review; the `#1619` follow-up depends on it. |
| `#1624` | UI docs merged (`7f3ee014`). The asset consolidation and drafts are root work in `thomas-brain` (the launcher refuses that repository); follow the spec's `#1624` paragraph and the carried `order-1624-assets.md`. No branch exists there yet. |
| `#1627`, `#1625`, `#1622`, `#1612`, `#1623`, `#418`, `#1613`, `#1620` | Unchanged. `#1625` waits on an owner phone check of the Gmail Android or iOS Copy code chip after a real code email. `#1612` staging acceptance needs the staging admin Orbit MCP and a runner rebound to the current staging commit. |
| Android | After `#1628` merges, run an Open release through the android-release skill; it carries `#1629`, `#1630`, `#1628` and the Open-pending fixes, then verify Play availability and close what it completes. |
| Dependabot UI1915/1916/1930/1932 | Sequential, unchanged. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows: the `#1633` zero-habit smoke round first, then each pull request to its exact approved head and merge, with the local merge-result check when the base moved onto a shared file, then one production web release, the smoke rerun and the Android Open release.
3. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; a single Vitest Chromium file is allowed when the order says so; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`, with the local merge-result check when the base moved onto a shared file. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above.
- Production web verification: done (`a2a0afb5` then `ea102cc9` live); the smoke red is carried as the first task.
- ui#1962 `#1633`: merged (`0ceff901`) and released; carried for the zero-habit smoke round and closure.
- ui#1956 `#1630`: merged (`59f37d89`) and released; carried for the Sentry check and Android.
- orbit-api#853 `#1617`: merged (`3b199d35`) after a clean merge-result build and test, released to staging and production; carried open for `#26` and `#1620`.
- UI1953 and ui#1960 `#1624`: merged (`ea102cc9`, `7f3ee014`); `#1624` asset work carried.
- ui#1946, ui#1897, ui#1958, ui#1959, ui#1955, ui#1961, ui#1903, ui#1944: one batch each this session, published at the heads above; carried for CI, review and merge, and `#181` for its root run.
- `#1626`: disposition recorded; UI half filed as `#1635` (ui#1963); carried.
- `#1627`, `#1625`, `#1622`, `#1612`, `#1623`, `#418`, `#1613`, `#1620`, Android, Dependabot, UI1952: carried (UI1952 rebaselined).
- "Workers, waiters, chain": superseded by the In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
