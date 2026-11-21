/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: decisions D931 to D938 on the run record `#2179`, `#2181` and `#2074`; the successor starts from D939. Each ticket's comments hold its round notes, reviews, design changes and work orders. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time, and copy it into each decision header and each intake mark. Merge `origin/main` into the relay branch after each merge to `main`.

Owner order: finish the work we started, no excuses, make it work. Work order v3 on `#2074` builds in two layers (D921); layer 1 is merged.

Tokens (owner order): the main account's weekly tokens reset each Thursday at 04:00 -03 and must last the week. ONE worker at a time, reviews included. Keep coordinator turns few and short; read only the verdict line and the BLOCKING findings of a review file. A review finding of a few lines is a coordinator fix (orchestrate step 8): record the round first with `node tools/fix-rounds.mjs --worktree <p> --record local` (plus `--design-change <file>` past the cap), one commit per round, each fix with a test proven red without it.

Models (owner orders): coordinator Opus 5.5; build and fix workers `claude-sonnet-5-5`; review workers run the review tier (Opus 5.5 xhigh). Workers run on the main account: pass `ORBIT_WORKER_CLAUDE_CONFIG_DIR=` empty on each launch, because the shell sets it. A worker that stops at a usage limit is reported to the owner at once. The Render MCP has no workspace: never pick one.

Pullfrog: the run reaches the Pullfrog console through Claude in Chrome (`https://pullfrog.com/console/thomasluizon/<repo>`); `npx -y pullfrog@0.1.138 config list --repo <owner/name>` reads the live rules. Its Review PRs rules are current in all three repositories and its Learnings fields are empty (owner order).

Reviews: every head, fix heads included, gets a read-only review before Pullfrog sees it (`compose-prompt.mjs --review [--since <prior head>]`, `launch-worker.mjs --review` in a detached worktree at the head); post each result with `post-run-note.mjs --kind review`. An order edited after `compose-prompt.mjs` fails its seal: never append to one. Ask Pullfrog with `list-bot-threads.mjs --head <sha> --wait-seconds 60` (0 posts no request).

Tool facts: the approval-prompt hook refuses a variable in a `cd` path, a `git` argument or a redirect target (a lower case variable set on the same line is allowed), `$(...)` in a command's words, a `[` beside a backtick, `while`, `tar`, `python3`, `pgrep`, `render` as a command word, an unquoted here-document delimiter and a pipe after `done`; write such steps to a script file and run it with `bash <path>` or `node <path>`. Ticket comments go through `tools/comment-ticket.mjs`. Push only with `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request. Copy every full SHA from `git rev-parse` output. `test-tools.mjs --only` repeats per module; the `pace-governor` module takes about 150 seconds.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `7947f0894`; API `main`, production and staging `9295ac75b`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`; Android Open and TestFlight 1.3.158 from `358ad030b`. Owner question queue: empty (`owner-questions.mjs --list` printed `[]`). Board 31 open, 31 placed in `## The order`, 0 unplaced, 0 placed twice. Last intake: Sentry 5 unresolved, no new event; mail 0 new; pull requests 0 pending; alerts 0 open. Next Sentry listing one hour after `intake.wake.sentryListedAt`.

| Item | Disposition |
| --- | --- |
| `#2181` ui#2509 | Worktree `ticket-2181-pace-governor`, branch `feature/ticket-2181-pace-governor`, local head `fabad556a` (rounds 9 to 15 by the coordinator, D932 to D938; tree clean; nothing pushed after `a4c62a196`). The review of `fabad556a` is on `#2181` with VERDICT DEFECTS (2): fix both as round 16 (`--design-change` needed), each with a test proven red, then review that head with `--since fabad556a`. Repeat until CLEAN. Then build the body from the body draft comment on `#2181` plus the body corrections in the latest review, push, reply to and resolve the 3 Pullfrog threads of `a4c62a196`, ask Pullfrog, `wait-ci.mjs --require-check pullfrog-approval`, merge at the bar. |
| `#2074` layer 2 | Next after ui#2509: the driver (v3 item 1), the totals at merge (v3 item 5), the verdict read (00:50 item 3) and the review NOTEs filed on `#2074` (two comments from the ui#2509 reviews). |
| `#2182` | Resolve ORBIT-API-1A at the first listing after the `resolveAfter` that `intake.sentry` holds, with no event newer than its `lastEventAt`, then `complete-ticket.mjs`. |
| `#2184` | Owner-reported Android launch screen hang; next after `#2074` layer 2. |
| `#2183` | Hook test rows read the live run record; build in order. |
| Held | ui#2491 and ui#2494 on api#1124; ui#2498 on its relay proofs; api#1120, api#1121, api#1124 to api#1128 on the `#2135` gate (run-status `UPDATE_BRANCH` for them stays unused while held); `#2122` closes after a web release carries it. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The In flight rows, one worker at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted (D931); the review of `4b500be1d` and coordinator rounds 9 to 15 (D932 to D938); hourly Sentry listings and one intake cycle.
- Carried: ui#2509 (round 16 next), `#2074` layer 2, the `#2182` close, `#2184`, `#2183`, `#2169`, `#2176`, `#2126`, `#2146`, `#2152`, the held rows, intake, every standing order above.
- Superseded: "the review of `4b500be1d` with `--since 225384230`" (done; the head is now `fabad556a`).

Treat every identifier here as a lead to verify.
