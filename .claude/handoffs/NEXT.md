/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

State lives on GitHub: decisions D908 to D923 on the run record `#2179` and on `#2074`, `#2181`, `#2182`; the successor starts from D924. Each ticket's comments hold its round notes, reviews, design changes and work orders. Start each wake with `node tools/run-status.mjs --session <id>`. Read `date` before you write a time, and copy it into each decision header. Merge `origin/main` into the relay branch after each merge to `main`.

Owner order: finish the work we started, no excuses, make it work. The owner approved work order v3 on `#2074`; it is built FIRST, before every other ticket, in two layers (D921).

Tokens (owner order): the main account's weekly tokens reset each Thursday at 04:00 -03 and must last the week. ONE worker at a time, reviews included. Keep coordinator turns few and short; read only the verdict line and the BLOCKING findings of a review file. A review finding of a few lines is a coordinator fix (orchestrate step 8): record the round first with `node tools/fix-rounds.mjs --worktree <p> --record local` (plus `--design-change <file>` past the cap), one commit per round, each fix with a test proven red without it.

Models (owner orders): coordinator Opus 5.5; build and fix workers `claude-sonnet-5-5`; the review worker tier moves to Opus 5.5 at xhigh effort when `ui#2510` merges (until then the main tier runs reviews). Workers run on the main account: pass `ORBIT_WORKER_CLAUDE_CONFIG_DIR=` empty on each launch, because the shell sets it. A worker that stops at a usage limit is reported to the owner at once. The Render MCP has no workspace: never pick one.

Pullfrog: the run reaches the Pullfrog console through Claude in Chrome (`https://pullfrog.com/console/thomasluizon/<repo>`); `npx -y pullfrog@0.1.138 config list --repo <owner/name>` reads the live rules. Its Review PRs rules are current in all three repositories and its Learnings fields are empty (owner order).

Reviews: every head, fix heads included, gets a read-only review before Pullfrog sees it (`compose-prompt.mjs --review [--since <prior head>]`, `launch-worker.mjs --review` in a detached worktree at the head); post each result with `post-run-note.mjs --kind review`. An order edited after `compose-prompt.mjs` fails its seal: never append to one.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path, a `git` argument or a redirect target (a lower case variable set on the same line is allowed), `$(...)` in a command's words, `while`, `tar`, `python3`, `pgrep`, `render` as a command word and an unquoted here-document delimiter; write such steps to a script file and run it with `bash <path>` or `node <path>`. Ticket comments go through `tools/comment-ticket.mjs`. Push only with `git push -u origin <branch>` from inside the worktree. One `wait-ci.mjs` per pull request. Copy every full SHA from `git rev-parse` output.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `1d13bec4c`; API `main`, production and staging `9295ac75b`; landing `main` and staging `3dbd6cd` (production `20c1b0a90`); web staging and production `2460ef091`; Android Open and TestFlight 1.3.158 from `358ad030b`. Owner question queue: empty. Board 31 open, 31 placed in `## The order`, 0 unplaced, 0 placed twice. Last intake: Sentry 5 unresolved with no new event; mail, Play reviews, pull requests and alerts: nothing pending. Next Sentry listing one hour after the mark in `intake.wake`.

| Item | Disposition |
| --- | --- |
| `#2074` layer 1, ui#2510 | Branch `chore/ticket-2074-review-mechanics`, worktree `ticket-2074-review-mechanics`. Pushed head `bd4fd5ba4` is APPROVED by Pullfrog with one open P1 thread `PRRT_kwDOR5Siws6552v0` (no precedence between the brief and the live rules). Local head `d77a67c4c` (round 11, the fix) is not pushed; its read-only review was launched at the relay. Read the review run note on `#2074` for head `d77a67c4c` (none: launch the review again with `--since bd4fd5ba4`). CLEAN: push, reply to and resolve the thread with `resolve-bot-thread.mjs` (`fixed in <sha>`), add round 11 to the body `## Fix rounds` and its test lines, ask Pullfrog, wait with `--require-check pullfrog-approval`, merge at the bar. DEFECTS: one more round needs a new design change file. |
| `#2074` layer 2 | After ui#2510 merges: the driver (v3 item 1), the totals at merge (v3 item 5), the verdict read (00:50 item 3), and the review NOTEs filed on `#2074`. |
| `#2181` ui#2509 | Round 4 commit `565960555` is committed, not pushed. After `#2074` layer 1 merges: merge `main`, local review at the new head, push, reply to and resolve the 3 Pullfrog threads, ask Pullfrog. |
| `#2182` | Resolve ORBIT-API-1A at the first listing after the `resolveAfter` that `intake.sentry` holds, with no new event, then `complete-ticket.mjs`. |
| `#2184` | Owner-reported Android launch screen hang; next after `#2074` layer 1. |
| `#2183` | Hook test rows read the live run record; build in order. |
| Held | ui#2491 and ui#2494 on api#1124; ui#2498 on its relay proofs; the api assistant pull requests on the `#2135` gate; `#2122` closes after a web release carries it. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. `#2074` layer 1, then the In flight rows, one worker at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle (Sentry hourly; mail, reviews, open pull requests and alerts, then the board), then the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it on the run record. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted (D922); `#2074` layer 1 rounds 7 to 11 (D923: the darwin identity reads `struct kinfo_proc` through `sysctl`, so a zombie lock holder reads as gone), ui#2510 pushed at `bd4fd5ba4` with a rewritten body (9042 tool assertions, 3283 hook checks), Pullfrog approved it and 3 of its threads are resolved; intake cycle: Sentry 5 unresolved with no new event, one Cloudflare notice acknowledged as noise, no review, pull request or alert pending.
- Carried: the `#2074` layer 1 close (round 11 review, push, the open thread), layer 2, the `#2182` close, `#2181`, `#2184`, `#2183`, `#2169`, `#2176`, `#2126`, `#2146`, `#2152`, the held rows, intake, every standing order above.

Treat every identifier here as a lead to verify.
