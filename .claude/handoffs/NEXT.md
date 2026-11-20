/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: the newest decision comments on the run record `#2179` and on `#2182`, `#2135`, `#2156` and `#2167` (decisions D897 to D907) hold the in-flight queue; the successor starts from D908. Each ticket's comments hold its round notes, reviews and reports. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time, and copy it into each decision header. The orchestrating checkout must contain `origin/main`: merge it into the relay branch after each merge to `main`.

Tokens (owner order): the main account's weekly tokens reset each Thursday at 04:00 -03 and must last the whole week. Run ONE worker at a time, reviews included. Chain several read-only reviews in one background task so one wake covers them. Keep coordinator turns short. The relay pair is settled at soft 300000 and hard 360000 (`#2180`): never propose another pair without a new measurement of the plan's cache-read weight.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit: workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty at launch). A worker that stops at a usage limit is reported to the owner at once. The Render MCP has no workspace selected: never pick one (the Render CLI in a script file reads logs).

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`, review-and-audit rule 14); post each result with `post-run-note.mjs --kind review`. A fix round posts its note with `post-run-note.mjs --kind round-note --round <n>`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap, and `--relaunch-reason` past the branch launch cap). A build order is never appended to: its work order goes to the ticket as a comment.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a review reads the whole diff, and every confirmed defect is BLOCKING. A fix round fixes every instance of each class, each with a test proven red with its guard removed. The coordinator fixes a false body statement and a small review fix itself (test red first). A body over 60,000 characters is compressed before a push. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path, a `git` argument or a redirect target, `$(...)` in a command's words, `${...}` with an operator, `while`, a glob in a `git` argument, `tar`, `python3`, `pgrep`, `render` as a command word, `[` beside a backtick, an unquoted here-document delimiter, and a GitHub node id no tool printed in this run (run `list-bot-threads.mjs --pr <n> --repo ui --wait-seconds 0 --no-request` first); write such steps to a script file and run it with `bash <path>` or `node <path>`. The git guardrail refuses `git worktree remove --force`. Ticket comments go through `tools/comment-ticket.mjs`, never `gh issue comment`. `list-bot-threads.mjs` exits 1 with a failing approval check, so a `set -e` script must not stop on it; `--wait-seconds 0` asks nothing, so request a review with a wait above 0. Never pipe a waiting tool into `head`. Push only with `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing. Copy every full SHA from `git rev-parse` output, never type one.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `1d13bec4c`; API `main` `9295ac75b`, production and staging `70c66e7be`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`; Android Open and TestFlight 1.3.158 from `358ad030b`. Owner question queue: empty (`owner-questions.mjs --list` printed `[]`). Board 29 open, 29 placed in `## The order`, 0 unplaced, 0 placed twice. No live local worker. Sentry: ORBIT-WEB-1H resolved and `#2156` closed; 5 unresolved, last listed 01:05Z, no new event; the next listing is due one hour after that mark. Mail, Play reviews, pull requests and alerts: nothing pending at 23:47Z.

| Item | Disposition |
| --- | --- |
| `#2182` | api#1130 merged as `9295ac75b` (API `main`; no migration, so no Render export is needed). Next: the API release through `/release` (staging, then production; API alone, never with web), then resolve ORBIT-API-1A after the release shows no new event, then close `#2182`. |
| Hook tests | `node .claude/hooks/test-hooks.mjs` failed 3 attended-commit rows at the relay (git-guardrails adapter and two handoff chain rows, got 2 want 0) after a text-only spec and prompt change; confirm on a clean checkout and ticket the cause if it reproduces (D907 on `#2182`). |
| `#2169` | ui#2500 merged, but the board still blocks it on `#2160`, `#2164` and `#2165`; its comments list what ui#2500 left to it and the `evals/astra` `vite` install defect. |
| `#2181`, `#2176`, `#2126`, `#2146`, `#2152` | One at a time after the API release, in the spec's order. |
| Held | ui#2491 and ui#2494 on api#1124, ui#2498 proofs A and B at a real relay plus the leaked-stub test fix (comment on `#2173`), the api assistant PRs on the `#2135` gate (baseline with cost complete; api#1130 also edits `AgentOperationExecutor.cs`, so the second to merge rebases), `#2122` closes after a web release carries it. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, one worker at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2500 merged (`1d13bec4c`) and `#2167` closed (D898); `#2182` built as api#1130, two local fix rounds and one coordinator fix, a CLEAN review, Pullfrog approval and the merge `9295ac75b` (D899 to D901, D904, D905, D907); ORBIT-WEB-1H resolved and `#2156` closed (D903); `#2135` cost row filled and `#2135` closed (D906); a leaked tool-test stub stopped and filed on `#2173` (D902); review NOTEs filed on `#2129`; intake cycle at 23:47Z (D897).
- Carried: the API release for `#2182`, the hook test check, `#2169`, `#2176`, `#2181`, `#2126`, `#2146`, `#2152`, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
