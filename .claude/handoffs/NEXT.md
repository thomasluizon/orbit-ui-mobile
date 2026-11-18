/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D645 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` holds each worktree, head and exact next command, and wins over this prompt. Task outputs of the predecessor do not carry: read S `review-<key>-local.md` for a verdict and `git log` in the worktree for a round result.

Models (owner order): the coordinator and Pullfrog run Opus 5.5; every worker tier runs `claude-sonnet-5-5`. Confirm all four tiers in `.claude/orchestrator.json`; never change or ask about a model unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (spec standing rules): run tooling (Batch T, Batch 0b) first; under crank never hold ready work; `/progress` reports merged and built work in product terms, no numbers.

Speed rules: a review order names the new commits only and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). A regression of the pull request or a failed acceptance probe starts a fix round. The coordinator corrects a false body statement before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only. A body stays under 60,000 characters.

Tool facts: the approval-prompt hook refuses a Bash command with `${=x}`, a variable command word, a `for` over a variable, a `[` beside a `$(`, backticks inside a `node -e` string, `sysctl`, or `ui#N` and `-` arguments on a bash line: write literal commands or a `.mjs` file, and use S `rv.sh <key> <repo:pr> <ticket> <wt> <head> <commits|whole> <earlier|none> <note|none>` for reviews (`CEILING=<min>` raises the review limit). A redirect target with a variable is refused. A script that calls `gh` on a ticket is refused: save one `gh issue list --json ...` to a literal path and process it with node. `grep` here is ugrep: search with node. A worker cannot start a browser, a dev server or an emulator.

Standing: reviews and proofs run as workers. The loop: `launch-review-round.sh`, `round-result.mjs`, `rv.sh`, `review-verdict.mjs <task> <key>`, `merge-main.mjs` (a stacked branch merges its base branch instead), `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`; `make-frog-note.mjs <pr> <round> <head> <key>` for Pullfrog threads; merge at once at the bar (green, fresh Pullfrog approval at the head, 0 threads, behind 0). Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 40, placed 40, unplaced 0, placed twice 0.

## In flight

UI `main` `dbcdecd71` (ui#2497 merged); API `main` `f7abe19fc`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. The relay checkout holds `origin/main`. Start the waiters at once.

| Item | Disposition |
| --- | --- |
| Pushed, Pullfrog asked: ui#2486, ui#2499, ui#2483, ui#2485, ui#2490, ui#2492, ui#2451, ui#2453 (heads in S task-map) | One `wait-ci.mjs --require-check pullfrog-approval` per repository; merge each at the bar; a failed Pullfrog gets one round. |
| Pullfrog FAILED, round notes written (S `note-<pr>-<round>.md`): ui#2502 r2 (3 threads; every other check green, Windows jobs included: merge it first), ui#2493 r5, ui#2498 r5 (plus `Tool tests (3/4)` red), ui#2476 r9, ui#2475 r12, ui#2495 r4, ui#2488 r5 (conflicts: merge the new ui#2486 head) | Launch each round with `launch-review-round.sh`, then the delta review and push. |
| ui#2501 r3 committed `0db27bbe9`, `1aaf68094` | `rv.sh 2501-r3 ui:2501 2168 <worktree> 1aaf68094 0db27bbe9,1aaf68094 review-2501-r2-local.md note-2501-r3.md`, then push with `body-2501-r3.md`. |
| ui#2500 base merge `d91990811` | Read S `review-2500-base1-local.md`; on CLEAN or NOTES push with `body-2500-base1.md`. |
| api#1129, api#1126 (Pullfrog FAILED, 0 threads) | Each review asks for a live provider probe in the body (api#1129: the model writes `{{habit:N\|phrase}}`; api#1126: the probe output and the `ai_change_plan` forks outside `TurnPolicy`). Cost estimate first, probe as a worker, then push. |
| ui#2480 (the `#2135` grader) and ui#2489: approved and green, one behind `main` | Merge `main` into each, push, Pullfrog, merge. ui#2480 first: it gates the six assistant pull requests. |
| ui#2498 (`#2173`) | Merge condition: the live relay proofs A and B of S `body-2498-main1.md` lines 35 to 55 (the branch code in the orchestrating checkout and a real relay). |
| ui#2491, ui#2494 | No code defect; both wait on api#1124 (regenerate the catalog at that API commit). |
| api#1120, api#1121, api#1124, api#1125, api#1127, api#1128 | Green and approved; each waits on the `#2135` core set gate (after ui#2480 merges) or its stack parent. |
| `#2146` and the releases | Web check through `claude-in-chrome` after the web release; the web release and the mobile pair once ui#2485 and ui#2499 merge. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then rounds and reviews, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; every listed round reviewed and pushed or committed; ui#2453 copy approval, whole review, fix round and first push.
- Carried: every other In flight row and every standing order above.

Treat every identifier here as a lead to verify.
