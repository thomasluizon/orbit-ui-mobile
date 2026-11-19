/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` (the RELAY queue block D827) hold the in-flight queue, the scratchpad folder that keeps the bodies, replies and push and launch helpers, and decisions D820 to D827; the successor starts from D828. Each ticket's comments hold its round notes, reviews and reports. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`, or `list-bot-threads.mjs` and `fix-rounds.mjs` refuse.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty at launch). At most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`, review-and-audit rule 14); post each result with `post-run-note.mjs --kind review`. A fix round posts its note with `post-run-note.mjs --kind round-note`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap). A build order is never appended to: its work order goes to the ticket as a comment.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING (an unused export, a test that cannot fail and a comment that contradicts the code included). A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path or a redirect target, `$(...)` in a command's words, `while`, a glob in a `git` argument, `tar`, `python3`, `[` beside a backtick, `$NAME:` or `$NAME[`, an unquoted here-document delimiter, and a GitHub node id no tool printed in this run; write such steps to a script file and run it with `bash <path>` or `node <path>`. Push only with the push helper of the queue block or `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing. The `clean-stale-files` hook deletes stale session folders and merged worktrees by itself; copy the queue files you need into your own scratchpad.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `2460ef091`; API `main` and production `70c66e7be`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging `2460ef091`, web production `2263a8b67`. Owner question queue: empty (`/questions --relay` recorded none). Board 36 open, 36 placed in `## The order`, 0 unplaced, 0 placed twice.

| Item | Disposition |
| --- | --- |
| ui#2451 (`#2121`) | Pushed `42585ea88`, review CLEAN, 0 unresolved, Pullfrog asked: wait, merge at the bar, close `#2121`, then ui#2453. |
| ui#2492 (`#2166`) | Pushed `89efd3b9f`, reviews CLEAN, eval suite 2,584 passed, Pullfrog asked: wait, merge at the bar, then the ui#2500 and ui#2501 base merges. |
| ui#2475 (`#2149`) | Local `be0ace398` (draft class and waiter key fix), not pushed: review since `89f927214`, reply, body, push, merge. |
| Releases | Production web release of `2460ef091` (staging verified), then the Android Open and TestFlight pair (never the App Store), then close `#2177` and run the `#2146` web check. |
| `#2145` | One device proof through `launch-worker.mjs --proof` (the `#2146` rendered check), then close. |
| `#2074` | The quality build on `chore/ticket-2074-whole-diff-review` (no commits; merge `main` first). |
| ui#2500, `#2126`, `#2135`, Harness | As the D818 block: ui#2500 round 2 after ui#2492; landing rendered check then production release; the `#2135` baseline window at 1.20 USD a day; the require-wake-source Stop hook firing inside a worker, fixed red first. |
| Held | ui#2453 (after ui#2451), ui#2501 (stacked on ui#2492), ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay, the api assistant PRs on the `#2135` gate, `#2156` after its `resolveAfter`, `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly, mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2451 round 3 tested (web related 4,062 passed), reviewed, review defects fixed and pushed (D823, D825); ui#2475 alert case split pushed (D821); ui#2492 retry thread fixed for its whole class and pushed (D822, D826); web staging release of `2460ef091` verified (D827); intake run (D824).
- Superseded: the D818 and D819 queue blocks (D827 replaces them).
- Carried: the production web and mobile releases, the `#2145` proof, the `#2074` build, the ui#2500, `#2126`, `#2135` and harness rows, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
