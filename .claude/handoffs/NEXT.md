/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` (the RELAY queue block D818, amended by D819) hold the in-flight queue, the scratchpad folder that keeps the bodies, replies and push and launch helpers, and decisions D806 to D819; the successor starts from D820. Each ticket's comments hold its round notes, reviews and reports. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`, or `list-bot-threads.mjs` and `fix-rounds.mjs` refuse.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty at launch). At most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`, review-and-audit rule 14); post each result with `post-run-note.mjs --kind review`. A fix round posts its note with `post-run-note.mjs --kind round-note`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap). A build order is never appended to: its work order goes to the ticket as a comment.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING (an unused export, a test that cannot fail and a comment that contradicts the code included). A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path or a redirect target, `$(...)` in a command's words, `while`, a glob in a `git` argument, `tar`, `python3`, `[` beside a backtick, an unquoted here-document delimiter, and a GitHub node id no tool printed in this run; write such steps to a script file and run it with `bash <path>` or `node <path>`. Push only with the push helper of the queue block or `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing. The `clean-stale-files` hook deletes stale session folders and merged worktrees by itself; keep queue files in this or the predecessor scratchpad.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `2460ef091`; API `main` and production `70c66e7be`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web production `2263a8b67`. Owner question queue: empty (`/questions --relay` recorded none). Board 36 open, 36 placed in `## The order`, 0 unplaced, 0 placed twice.

| Item | Disposition |
| --- | --- |
| ui#2451 (`#2121`) | Fix round 3 of 3 local (`055ba2de7`, report on `#2121`): web related tests, review `--since fbb7530e1`, `main` merge, push with the round 3 body and replies, merge at the bar. Then ui#2453. |
| ui#2492 (`#2166`) | Pushed `22ae0dc81`; Pullfrog asked one change (client path sets no `rateLimitRetryable: false`, `evals/astra/client-path.mjs:71`): fix every return shape red first, review, push, merge. Then ui#2500 base merge. |
| ui#2475 (`#2149`) | Pushed `dd0ed4d47`; one structural thread: split the alert case groups out of `tools/__tests__/auto-work-github.mjs` (1,059 lines) into their own case module (coordinator, rounds spent), push, merge. |
| Releases | Web release with ui#2499, ui#2503, ui#2504, then the Android Open and TestFlight pair (never the App Store), then close `#2177` and run the `#2146` web check. |
| `#2145` | One device proof through `launch-worker.mjs --proof` (the `#2146` rendered check), then close. |
| `#2074` | The quality build on `chore/ticket-2074-whole-diff-review` from `main` (recreate the worktree if the stale hook removed it). |
| ui#2500, `#2126`, `#2135`, Harness | As in the D818 block: ui#2500 round 2 after ui#2492; landing rendered check then production release; the next `#2135` baseline window at 1.20 USD a day; the require-wake-source Stop hook firing inside a worker, fixed red first. |
| Held | ui#2453 (after ui#2451), ui#2501 (stacked on ui#2492), ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay, the api assistant PRs on the `#2135` gate, `#2156` after its `resolveAfter`, `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (not run in the previous two sessions): Sentry, mail, reviews, open pull requests and alerts, then the board, in the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2476 merged (`1d97be363`), ui#2483 merged (`775f52767`, `#2143` closed), ui#2504 merged (`2460ef091`, both threads and two hygiene threads fixed); ui#2451 CI fix pushed and round 3 built; ui#2475 review, doc fix and push; ui#2492 review fixes, eval suite and push.
- Superseded: the review subagent rule (ui#2476 merged: reviews run on read-only workers); the "delete nothing" stale-file rule (the queue files are copied to the current scratchpad, D815).
- Carried: the ui#2451, ui#2492, ui#2475 and ui#2500 rows, the `#2126` production release, the `#2135` window, the harness hook fix, the `#2074` build, the web and mobile releases, the `#2145` proof, the ui#2498 proofs, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
