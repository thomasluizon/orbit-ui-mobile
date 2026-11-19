/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` (decisions D884 to D888) hold the in-flight queue; the successor starts from D889. Each ticket's comments hold its round notes, reviews and reports. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`.

Tokens (owner order): the main account's weekly tokens reset each Thursday at 04:00 -03 and must last the whole week. Run ONE worker at a time, reviews included. Chain several read-only reviews in one background task so one wake covers them. Keep coordinator turns short. The relay pair is settled at soft 300000 and hard 360000 (`#2180`): never propose another pair without a new measurement of the plan's cache-read weight.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty at launch). A worker that stops at a usage limit is reported to the owner at once. The Render MCP has no workspace selected: never pick one.

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`, review-and-audit rule 14); post each result with `post-run-note.mjs --kind review`. A fix round posts its note with `post-run-note.mjs --kind round-note`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap, and `--relaunch-reason` past the branch launch cap). A build order is never appended to: its work order goes to the ticket as a comment.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING. A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path, a `git` argument or a redirect target, `$(...)` in a command's words, `while`, a glob in a `git` argument, `tar`, `python3`, `pgrep`, `[` beside a backtick, an unquoted here-document delimiter, and a GitHub node id no tool printed in this run (run `list-bot-threads.mjs --pr <n> --repo ui --wait-seconds 0 --no-request` first); write such steps to a script file and run it with `bash <path>` or `node <path>`. Push only with `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing. Copy every full SHA from `git rev-parse` output, never type one.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `4233ee558`; API `main`, production and staging `70c66e7be`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`; Android Open and TestFlight 1.3.158 from `358ad030b`. Owner question queue: empty (`/questions --relay` had nothing to filter). Board 32 open, 32 placed in `## The order`, 0 unplaced, 0 placed twice (`#2182` was created in this session). No live worker; no detached check.

| Item | Disposition |
| --- | --- |
| ui#2500 (`#2167`) | Round 9 committed `df6f43a49` on the `ticket-2167-corpus-lifecycle` worktree, not pushed (round report on `#2167`). Read-only review since `a421324fb`, then body and replies to `PRRT_kwDOR5Siws65rWul` and `PRRT_kwDOR5Siws65rWuw` from the report, push, Pullfrog, merge at the bar. |
| `#2135` | Baseline complete. After 00:05 UTC, rerun the merge with `--run-cost-usd` (small measurement order on the ticket), then close per acceptance. |
| `#2182` | New live API defect (ORBIT-API-1A, cause verified in the ticket): build after ui#2500, then API release, then resolve the Sentry issue. |
| `#2181`, `#2176`, `#2126`, `#2146`, `#2152` | One at a time after the open pull requests. |
| Held | ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay, the api assistant PRs on the `#2135` gate, `#2156` after its `resolveAfter`, `#2122` closes after a web release carries it. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, one worker at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly, last listed 19:17Z; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2506 D881 fix, reseed, review CLEAN, merged `4233ee558` (D885, D887); ui#2500 round 8 reviewed CLEAN, pushed `5e63795b7`, Pullfrog COMMENTED, round 9 built `df6f43a49` (D885, D887, D888); `#2135` r6 resume finished, baseline complete (D886, D888); intake cycle (D885, Sentry 19:17Z, `#2182` from ORBIT-API-1A).
- Carried: ui#2500, `#2135` cost row, `#2176`, `#2181`, `#2126`, `#2146`, `#2152`, `#2182`, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
