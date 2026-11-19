/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/orchestrate` over the admitted queue without replanning. Crank is OFF (owner order): never invoke `/crank`. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D767 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` and S `pending-queue.md` hold each worktree, head and next command, and win over this prompt. Predecessor task outputs do not carry: read S `review-<key>-local.md` and `git log` in the worktree. A `cd` into S resets the shell: call S tools by absolute path.

Models and accounts (owner orders): the coordinator runs Opus 5.5; every worker tier runs `claude-sonnet-5-5`; never change or ask about a model. Pullfrog runs on the main account token. The worker account is at its weekly limit (the last launch result names its reset), so S `gated-launch.sh` unsets `ORBIT_WORKER_CLAUDE_CONFIG_DIR` and workers run on the main account. The main account's weekly tokens must last until its reset: at most 3 workers at once, reviews included; drive open pull requests to the merge bar before a new ticket. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected. The Render MCP has no workspace selected: never pick one.

Quality order (owner, the newest comment on `#2074`): speed WITH quality. Before every push, a local review reads the whole diff (S `rv.sh`), and every confirmed defect is BLOCKING (an unused export and a comment that contradicts the code included); fix it before the push. A fix round (S `make-frog-note.mjs`, S `launch-review-round.sh`, `FIX_ROUND=local` for a local finding) fixes every instance of each class, each with a test proven red with its guard removed. Replace free-text guessing with a structured input or delete it. The coordinator fixes a false body statement and a small review fix itself (test red first, then commit and push). At the fix-round cap, one more round needs a new design file (`DESIGN=<absolute file>`). A body over 60,000 characters stops S `push-round.mjs`: compress an old section. `/progress` reports merged and built work in product terms, no numbers.

Tool facts: the approval-prompt hook refuses a variable in a `cd` path or a redirect target, a glob in a `git` argument, `${...}` with an operator, `python3`, `sysctl`, `pgrep`; a here document that holds a tickets issue URL trips the ticket-mutation hook (write that file with the Write tool). Search with node (S `grep-body.mjs <file> <regex>`, S `line.mjs <file> <from> <to>`); S `job-fails.mjs orbit-ui-mobile <job id>`. Run eval tests from `evals/astra` (a run from the root writes a stray `reports/` that the commit hook refuses). A worker cannot start a browser, a dev server or an emulator. One `wait-ci.mjs` per pull request; exit 3 is the ceiling, 4 a moved head, 6 settled failing.

Standing loop: S `rv.sh`, S `review-verdict.mjs <task> <key>`, S `merge-main.mjs` (exits 2 on a conflict; never in a worktree a worker reads), S `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; S `pr-bar.mjs ui:<n> ...`; merge at once at the bar. After every `main` merge, merge `origin/main` into the relay checkout and into each approved pull request. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

## In flight

UI `main` `6934dd6ca`; API `main` and production `70c66e7be`; landing `main` `20c1b0a90`; web production `2263a8b67`. Owner question queue: empty. Board 38 open, 38 placed in `## The order`, 0 unplaced, 0 placed twice.

| Item | Disposition |
| --- | --- |
| ui#2504 (`#2177`) | Review 2504-r3 of a03d90031 is BLOCKING 3 (a red mobile auth-store test, two guards): launch first, `FIX_ROUND=local DESIGN=S/design-2504-r4.md` S `launch-review-round.sh ui 2177 W/ticket-2177-one-delete-toast main deep r4 S/note-2504-r4.md <reason>`; review, push with S `body-2504-r4.md`, merge at the bar. |
| ui#2480 (`#2135`) | Design round s6g (S `design-2480-s6g.md`, `note-2480-s6g.md`) in W/ticket-2122-part3: read its commit, review 2480-s6g, push with S `body-2480-s6e.md` plus a `## s6g` section. |
| ui#2476 (`#2145`) | Pushed 5f571d83e (review NOTES 1), Pullfrog asked: a waiter, merge at the bar. |
| ui#2475 (`#2149`) | Pullfrog failed at 643e3077e (2 threads): design round s6y (S `design-2475-s6y.md`, `note-2475-s6y.md`). |
| ui#2488, ui#2493 | Pushed ab806b810 and c59290a82, Pullfrog asked: a waiter each, merge at the bar. |
| ui#2498 (`#2173`) | Pullfrog found nothing; it approves after live relay proofs A and B (S `body-2498-m3.md` `## Live relay proof`), which need the branch code in the orchestrating checkout at a real relay. |
| Next launches | S `pending-queue.md` first block: 137-s6w review, ui#2483 and ui#2451 Pullfrog rounds (main merged), the `#2074` quality build, ui#2453 and ui#2500 resumes. |
| Releases | After ui#2504 merges: one web release (`/release`) with ui#2499, ui#2503, ui#2504; then the Android Open and TestFlight pair (never the App Store); then the `#2146` web check. |
| Held | ui#2492, ui#2500, ui#2501 stacked on ui#2480; ui#2491, ui#2494 on api#1124; the api assistant PRs on the `#2135` gate; `#2156` after its `resolveAfter`; `#2176` after `#2122`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive the In flight rows, 3 workers at a time: merges first, then reviews and rounds, then launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2503 merged (`#2178` closed); ui#2480 s6e notes fixed and pushed; ui#2488 r10 and r11 pushed; ui#2498 m3 blocker fixed and pushed; reviews 2475-s6w and 2493-s6w fixed and pushed; ui#2476 pushed; ui#2504 r3 round committed and reviewed; intake clean.
- Carried: every In flight row, the ui#2498 proofs, the held rows, the `#2074` quality build, every standing order above.

Treat every identifier here as a lead to verify.
