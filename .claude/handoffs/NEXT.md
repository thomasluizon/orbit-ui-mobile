/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: decisions D908 to D919 on the run record `#2179` and on `#2074`, `#2181`, `#2182`; the successor starts from D920. Each ticket's comments hold its round notes, reviews and work orders. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time, and copy it into each decision header. Merge `origin/main` into the relay branch after each merge to `main`.

Owner order: finish the work we started, no excuses, make it work. The owner approved work order v3 on `#2074` after three independent devil's advocates agreed; it is built FIRST, before every other ticket.

Tokens (owner order): the main account's weekly tokens reset each Thursday at 04:00 -03 and must last the week. ONE worker at a time, reviews included. Keep coordinator turns few and short; read only the verdict line and the BLOCKING findings of a review file.

Models (owner orders): coordinator Opus 5.5; build and fix workers `claude-sonnet-5-5`; the review worker tier moves to Opus 5.5 at xhigh effort (owner order in chat, part of `#2074` v3). Workers run on the main account (`ORBIT_WORKER_CLAUDE_CONFIG_DIR` empty). A worker that stops at a usage limit is reported to the owner at once. The Render MCP has no workspace: never pick one (the Render CLI in a script file reads logs).

Pullfrog: the run reaches the Pullfrog console through Claude in Chrome (`https://pullfrog.com/console/thomasluizon/<repo>`); never call it owner-only. Its Review PRs rules are current in all three repositories, with "Approval. Approve the head when no blocking finding remains...", and its Learnings fields are empty (owner order).

Reviews: every pre-push and fix-round review runs on a read-only worker (`compose-prompt.mjs --review`, `launch-worker.mjs --review`); post each result with `post-run-note.mjs --kind review`. A fix round posts `post-run-note.mjs --kind round-note --round <n>`, then `compose-prompt.mjs --review-batch`, then `launch-worker.mjs --fix-round <local|pullfrog>` (with `--design-change <file>` past the cap of 3, and `--relaunch-reason` past the branch launch cap).

Tool facts: the approval-prompt hook refuses a variable in a `cd` path, a `git` argument or a redirect target, `$(...)` in a command's words, `while`, `tar`, `python3`, `pgrep`, `render` as a command word and an unquoted here-document delimiter; write such steps to a script file and run it with `bash <path>` or `node <path>`. Ticket comments go through `tools/comment-ticket.mjs`. Push only with `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request. Copy every full SHA from `git rev-parse` output.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `1d13bec4c`; API `main`, production and staging `9295ac75b`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`; Android Open and TestFlight 1.3.158 from `358ad030b`. Owner question queue: empty (`owner-questions.mjs --list` printed `[]`). Board 31 open, 31 placed in `## The order`, 0 unplaced, 0 placed twice. No live worker, no live waiter. Sentry: 5 unresolved, no new event at the last listing; next listing one hour after the last mark. Mail, Play reviews, pull requests and alerts: nothing pending at the last intake.

| Item | Disposition |
| --- | --- |
| `#2074` | Build the "Work order v3" comment now, first: driver off the coordinator, parity review on every head (Opus 5.5 xhigh review tier), sandbox process identity without setuid `ps`, one fix launch per head, per pull request totals. Measure the next 3 pull requests against its targets. |
| `#2181` ui#2509 | Worktree `ticket-2181-pace-governor`, branch `feature/ticket-2181-pace-governor`: round 4 commit `565960555` is committed, not pushed (fixes the 3 Pullfrog P1 threads under the design change). After `#2074` v3: local review at that head, update the body, push, reply to and resolve the threads, ask Pullfrog. Fix rounds used: 4 (cap 3 plus one design change). |
| `#2182` | Released. Resolve ORBIT-API-1A at the first listing after the 24-hour watch in intake.sentry (resolveAfter) with no new event, then `complete-ticket.mjs`. |
| `#2184` | Owner-reported Android launch screen hang; next after `#2074`. |
| `#2183` | Hook test rows read the live run record; build in order. |
| Held | ui#2491 and ui#2494 on api#1124; ui#2498 on its relay proofs; the api assistant pull requests on the `#2135` gate; `#2122` closes after a web release carries it. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. `#2074` v3, then the In flight rows, one worker at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: API released to staging and production at `9295ac75b` (D910, D913); ORBIT-API-1A watch recorded (D914); hook test cause filed as `#2183` (D909); `#2181` built as ui#2509 with three local rounds and a Pullfrog design-change round (D911, D915 to D917); owner report filed as `#2184`; review loop plan v3 approved and Pullfrog rules cleaned (D918, D919).
- Carried: the `#2182` close, `#2169`, `#2176`, `#2126`, `#2146`, `#2152`, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
