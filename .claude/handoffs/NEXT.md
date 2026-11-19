/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D737 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` and S `pending-queue.md` hold each worktree, head and next command, and win over this prompt. Predecessor task outputs do not carry: read S `review-<key>-local.md` and `git log` in the worktree.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token (set in all three repositories). The worker account is at its weekly limit (the last launch result names its reset), so S `gated-launch.sh` unsets `ORBIT_WORKER_CLAUDE_CONFIG_DIR` and workers run on the main account. The main account's weekly tokens must last until its reset: at most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. No pull request spends a day in review rounds. Before every push, a local review reads the whole diff as Pullfrog does (S `make-review-orders.mjs`, through S `rv.sh`), and every confirmed defect is BLOCKING; fix it before the push. A fix round (S `make-frog-note.mjs`, S `launch-review-round.sh`, `FIX_ROUND=local` for a local finding) fixes every instance of each class in the diff, each with a test proven red with its guard removed. Replace free-text guessing with a structured input or delete it; never add a pattern. The coordinator fixes a false body statement and a small review fix itself. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a Bash command with a variable in a `cd` path or a redirect target, `${...}` with an operator, `python3`, `sysctl`, `pgrep`, or `ui#N` and `-` arguments on a bash line: write literal commands, a here document or a `.mjs` file. `grep` is ugrep and `ls` is not plain: search with node (S `grep-body.mjs <file> <regex>`, S `job-fails.mjs <repo> <job>`). A worker cannot start a browser, a dev server or an emulator. One `wait-ci.mjs` per pull request; exit 3 is the ceiling (start it again), 4 a moved head, 6 settled failing.

Standing loop: S `rv.sh`, S `review-verdict.mjs <task> <key>`, S `merge-main.mjs` (exits 2 on a conflict; never run it in a worktree a worker or reviewer is reading), S `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; S `pr-bar.mjs`; merge at once at the bar (green, fresh Pullfrog approval at the head, 0 threads, behind 0). A merge to `main` puts every approved pull request behind: merge `main` into each and ask Pullfrog again. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `1442f12a0`; API `main` and production `70c66e7be`; landing `main` `20c1b0a90`; web production `2263a8b67`. Owner question queue: empty.

| Item | Disposition |
| --- | --- |
| FIRST: `#2177` (owner, delete toast) | W/ticket-2177-one-delete-toast at d6937de09: round r2 (S `note-2177-r2.md`) was refused by the relay drain: launch it, review, then push and open the PR with `body-2177-r2.md`. Ship through the web and mobile releases. |
| `#2178` (owner, sidebar swap) | W/ticket-2178-sidebar-swap e8e745884: read S `review-2178-r1-local.md`; on CLEAN push and open the PR with S `body-2178-r1.md`, label `parity:exempt`. Ship through the web release. |
| ui#2480 | Redesign round s6c (drops the regex card grader for a Claude read): read its commit, review it, push `body-2480-s6c.md`. Then ui#2492, ui#2500, ui#2501 merge the new base chain. |
| `#2074` quality rules | W/ticket-2074-review-quality has no commit: launch S `note-2074-quality.md` with S `launch-build.sh`. Keep that worktree (stale-files lists it wrongly). |
| ui#2488 | Main merge conflicts with ui#2495 (five files): a worker resolves them on top of the local export-list commit. |
| Pullfrog failed | ui#2451 b62f2d6e0, ui#2483 994c4d5b6 (S `note-2483-s6a.md`): one class-fix round each. |
| Resume after the limit | ui#2453 (two commits and a dirty tree), ui#2500 (dirty tree). |
| Reviews to relaunch | 2475-s6w, 2493-s6w, 2476-r13w, 137-s6w (whole-diff template). |
| Waiting on CI and Pullfrog | ui#2498 e709157b9, ui#2499 1a3998797: start a waiter. ui#2498 also needs proofs A and B at a real relay. |
| Held | ui#2501 approved (stacked); ui#2491, ui#2494 on api#1124; the api assistant PRs on the `#2135` gate. `#2156` after its `resolveAfter`; `#2176` after `#2122`; `#2146` checks. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2495 merged (1442f12a0, `#2171` closed); Pullfrog moved to the main account; crank turned off; owner tickets `#2177` and `#2178` filed and built; review and fix templates rewritten for quality; ui#2501 approved; ui#2498, ui#2499, ui#2451, ui#2483, ui#2488 pushed.
- Carried: every In flight row, ui#2498 proofs, the held rows, every standing order above.

Treat every identifier here as a lead to verify.
