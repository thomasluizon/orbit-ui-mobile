/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comment on the run record `#2179` (the RELAY queue block) holds the full in-flight queue (worktrees, heads, review, body and reply files, launch and push commands) and decisions D774 to D789; the successor starts from D790. Each ticket's comments hold its round notes and reviews. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`, or `list-bot-threads.mjs` refuses.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` unset at launch). At most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Launching under main's order seal (`ui#2488`): a fix round posts its note with `node tools/post-run-note.mjs --kind round-note --issue <ticket> --round <n> --head <full sha> --body-file <note>`, then `node tools/compose-prompt.mjs --review-batch` writes the sealed order, then `tools/launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap). A build order is never appended to: its work order goes to the ticket as a comment. Until `ui#2476` merges, a pre-push review is a read-only subagent on Sonnet that follows a written review order (D768).

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING (an unused export and a comment that contradicts the code included). A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path or a redirect target, `$(...)` in a command's words, `while`, a glob in a `git` argument, `tar`, `python3`, `sysctl`, `pgrep`, an unquoted here-document delimiter; write such steps to a script file and run it with `bash <path>`. Push only with `git push -u origin <branch>` from inside the worktree or the push helper of the queue block. Search with node scripts. Run eval tests from `evals/astra`. A worker cannot start a browser, a dev server or an emulator. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing. `tools/stale-files.mjs` deletes a whole listing only: while the listing holds the predecessor scratchpad that the queue block still uses, delete nothing and log it.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `a220a65bf`; API `main` and production `70c66e7be`; landing `main` `3dbd6cd` (production `20c1b0a90`); web production `2263a8b67`. Owner question queue: empty. Board 38 open, 38 placed in `## The order`, 0 unplaced, 0 placed twice.

| Item | Disposition |
| --- | --- |
| ui#2504, ui#2480, ui#2493, ui#2475, ui#2483 | Pushed with `main` merged, Pullfrog asked: start one waiter each, merge each at the bar; a small Pullfrog thread gets a coordinator fix. |
| ui#2476 (`#2145`) | Local `9ca0c0e91` (round 3 of 3 plus a resolved `main` merge). Review BLOCKING 1: a platform-free test for the engine refusal of `tools/lib/review-run.mjs`, red first; correct the reply and body claim; push; merge at the bar. |
| ui#2451 (`#2121`) | Local round 1 plus `main` merge; review BLOCKING 4: a local fix round 2 naming the four classes, review, push, merge. |
| ui#2500 (`#2167`) | Local round 1; review BLOCKING 3: a local fix round 2, review, push, merge (stacked on the ui#2492 branch). |
| `#2074` | The quality build after ui#2476 merges (worktree `ticket-2074-whole-diff-review`, no commit). |
| `#2126` | landing#137 merged: carry the new inline hashes into `orbit-api/infra/landing-csp.tf`, then the landing staging release, a rendered check, production, close. |
| Releases | After ui#2504 merges: one web release with ui#2499, ui#2503, ui#2504; then the Android Open and TestFlight pair (never the App Store); then the `#2146` web check. |
| Held | ui#2453 (3 threads, after ui#2451 lands), ui#2492 (base merge after ui#2480), ui#2501, ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay, the api assistant PRs on the `#2135` gate, `#2156` after its `resolveAfter`, `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle: Sentry, mail, reviews, open pull requests and alerts, then the board, in the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2505 merged; landing#137 two threads plus two review fixes, merged; ui#2504, ui#2480, ui#2493, ui#2475, ui#2483 merged `main` and pushed; ui#2451, ui#2500, ui#2476 rounds run and reviewed; intake clean; stale files deleted once.
- Carried: the three BLOCKING reviews, the `#2074` build, the `#2126` release, the web and mobile releases, the ui#2498 proofs, the held rows, every standing order above.

Treat every identifier here as a lead to verify.
