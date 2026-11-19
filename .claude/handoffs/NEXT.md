/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` (the RELAY queue block D867) hold the in-flight queue, the scratchpad folder that keeps the bodies, replies and push and launch helpers, and decisions D860 to D867; the successor starts from D868. Each ticket's comments hold its round notes, reviews and reports. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`.

Tokens (owner order): the main account's weekly tokens reset each Thursday at 04:00 -03 and must last the whole week. Run ONE worker at a time, reviews included. Chain several read-only reviews in one background task so one wake covers them. Keep coordinator turns short. The relay pair is settled at soft 300000 and hard 360000 (`#2180`): never propose another pair without a new measurement of the plan's cache-read weight.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty at launch). A worker that stops at a usage limit is reported to the owner at once. The Render MCP has no workspace selected: never pick one.

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`, review-and-audit rule 14); post each result with `post-run-note.mjs --kind review`. A fix round posts its note with `post-run-note.mjs --kind round-note`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap). A build order is never appended to: its work order goes to the ticket as a comment.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING. A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path, a `git` argument or a redirect target, `$(...)` in a command's words, `while`, a glob in a `git` argument, `tar`, `python3`, `[` beside a backtick, an unquoted here-document delimiter, and a GitHub node id no tool printed in this run; write such steps to a script file and run it with `bash <path>` or `node <path>`. Push only with the push helper of the queue block or `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `a858166e0`; API `main`, production and staging `70c66e7be`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`; Android Open and TestFlight 1.3.158 from `358ad030b`. Owner question queue: empty. Board 30 open, 30 placed in `## The order`, 0 unplaced, 0 placed twice (`#2180` was created and closed in this session).

| Item | Disposition |
| --- | --- |
| ui#2506 (`#2074`) | Pushed `3584c8754`, round 4 reviewed CLEAN, threads resolved, Pullfrog asked: wait-ci, merge at the bar; then the approval measurement and the require-wake-source work order. |
| ui#2508 (`#2135`) | Pushed `c464081a4`, reviewed CLEAN, Pullfrog asked: wait-ci, merge at the bar; then recompose the r6 measurement order and launch it with `--measurement`. |
| ui#2453 (`#2122`) | Round 4 committed `52d2cefe8`, not pushed: review since `c1bde0dec`, merge `main`, push with the round 4 body named in the queue block, Pullfrog. |
| ui#2500 (`#2167`) | Pushed `abc01a676`; `pullfrog-approval` failed: read the threads, a fix round with a design change, review, push, merge. |
| `#2126`, `#2146`, `#2152` | One at a time after the open pull requests: the landing fix pull request (work order comment), the `operations.md` Android proof deviations then close, the measurement-mode work order. |
| Held | ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay, the api assistant PRs on the `#2135` gate, `#2156` after its `resolveAfter`, `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, one worker at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2500 round 6 reviewed CLEAN and pushed (D861); ui#2506 round 4 built, reviewed and pushed (D861, D867); ui#2453 round 4 built (D865); the `#2135` grader work order built as ui#2508 and reviewed (D865, D867); intake cycle (D862); the owner's token order (D863) and relay order (D864, ui#2507 merged, D866).
- Superseded: "At most 3 workers at once" (now one worker at a time, D863); the D859 queue block (the D867 block replaces it).
- Carried: ui#2453, ui#2500, ui#2506, ui#2508, `#2126`, `#2135` r6, `#2146`, `#2152`, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
