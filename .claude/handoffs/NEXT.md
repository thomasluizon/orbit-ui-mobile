/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` (the RELAY queue block D851) hold the in-flight queue, the scratchpad folder that keeps the bodies, replies and push and launch helpers, and decisions D842 to D851; the successor starts from D852. Each ticket's comments hold its round notes, reviews and reports. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`, or `list-bot-threads.mjs` and `fix-rounds.mjs` refuse.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty at launch). At most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`, review-and-audit rule 14); post each result with `post-run-note.mjs --kind review`. A fix round posts its note with `post-run-note.mjs --kind round-note`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap). A build order is never appended to: its work order goes to the ticket as a comment.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING (an unused export, a test that cannot fail and a comment that contradicts the code included). A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path or a redirect target, `$(...)` in a command's words, `while`, a glob in a `git` argument, `tar`, `python3`, `[` beside a backtick, `$NAME:` or `$NAME[`, an unquoted here-document delimiter, and a GitHub node id no tool printed in this run; write such steps to a script file and run it with `bash <path>` or `node <path>`. Push only with the push helper of the queue block or `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing. The `clean-stale-files` hook deletes stale session folders and merged worktrees by itself; copy the queue files you need into your own scratchpad.


## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `358ad030b`; API `main` and production `70c66e7be`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`. Owner question queue: empty (`/questions --relay` recorded none). Board 31 open, 31 placed in `## The order`, 0 unplaced, 0 placed twice.

| Item | Disposition |
| --- | --- |
| ui#2453 (`#2122`) | Round 3 committed `c1bde0dec`, not pushed (three threads fixed, final ui#2451 head and `main` merged): review since `63ae9c52c`, replies, compressed body, push, merge at the bar. |
| ui#2500 (`#2167`) | Round 4 committed `8aab04754`, not pushed; the `main` merge conflicts in four eval files: round 5 with the design change named in the queue block, review since `2afb472cc`, push, merge. |
| ui#2506 (`#2074`) | Pushed `660610586`; Pullfrog left two P1 threads on `review-and-audit.md`: fix round 3 of 3, review, push, merge; then the approval measurement. |
| `#2146` | Web proof at 375 posted: all steps pass except the dark fill (the edge reaches 3:1). Next: the edge against a habit card in both themes, then the Android Open and TestFlight pair (never the App Store), close `#2177` and `#2146`. Put the Android proof deviations into `operations.md` `## Android devices and Play`. |
| `#2126`, `#2135`, Harness | Landing rendered check then production release; the `#2135` baseline window at 1.20 USD a day; the require-wake-source Stop hook firing inside a worker, fixed red first. |
| Held | ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay, the api assistant PRs on the `#2135` gate, `#2156` after its `resolveAfter`, `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly, now due; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2501 and ui#2475 merged, `#2168` and `#2149` closed (D848, D849); the first auto-work pull request and alert collection ran (D849); ui#2475 reviews and Pullfrog threads fixed (D843, D847); ui#2501 review and body (D843); ui#2506 round 1 pushed, round 2 and its review fix pushed (D843, D850); the `#2146` web half ran as a Playwright proof on staging (D845, D850); ui#2453 round 3 relaunched and committed (D846); intake (mail, D849).
- Superseded: the D841 queue block (the newest RELAY block on `#2179` replaces it); the `#2146` web check in Chrome (D845: Chrome cannot render 375).
- Carried: ui#2453, ui#2500, ui#2506, the `#2146` edge check and the mobile pair, the `#2126`, `#2135` and harness rows, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
