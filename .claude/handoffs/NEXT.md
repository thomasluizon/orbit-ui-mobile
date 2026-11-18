/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). It carries about 750 files and repoints the id. Start a new `sleep-decisions.md` from D477 with the Write tool. A missing file is in `$HOME/.orbit-run-carry/scratchpad-73f58926` (replace its old temporary directory prefix).

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank until that account's weekly reset (10:00 UTC; `seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`): keep every lane busy with work that gives results. Workers run `claude-opus-5-5` until the reset. At the reset, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local now. The `usage-guard.mjs` order is over. Sentry is connected; the Gmail, Orbit and Chrome connectors are not, so console steps wait.

Pullfrog token: the owner has an authorize link for the worker account. When he pastes a code and `pgrep -f token-swap.py` shows the process, write the code to `token-swap-code.txt` in the predecessor's scratchpad. When the process is gone, run `python3 -I` S `token-swap.py` as a background task, give him the link from S `token-swap-url.txt`, and take the code. Until then reviews run on the main account token.

Speed orders (owner approved; the work orders are the newest comments on `#2074`, `#2129` and `#2122`; reports in S `speed-research/`). Apply them now and build them FIRST:
- Reviews: rule 14 of `review-and-audit.md` as written, two local passes, then push. Only a finding with a failing probe against the ticket's acceptance, or a regression of the pull request, starts a round; file each other class once. A review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE.
- Workers run focused tests only (`vitest related`, `test-tools.mjs --only`); CI runs the full suites. Rewrite S `note-verify-cap.md` to say so.
- One worker builds the `#2074` comment on a new branch from `main`; land ui#2469 with what is done.
- `#2129`: start 2-api and 3a now, then 5-api and 6-api; the eval ceiling is 1.20 USD a day.
- `#2122` merges in seven parts; `#2126` starts now; `#2125` starts after `#2144`.

Standing: reviews and proofs run as workers (S `launch-review-worker.sh <ticket> <worktree> <order> <reason>`; a review counts with `commitsSinceLaunch` 0 and `treeClean` true). Fix rounds: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>`, `CEILING` 75 to 120. Post each round note on its ticket with `tools/comment-ticket.mjs` before the launch. Read every worker diff (S `diff-scan.mjs`). Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. Resolve threads with `node tools/resolve-bot-thread.mjs`, push, `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 25, placed 25, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `ca538e933`; API `main` `38513551a`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. No worker runs. Read each worktree first.

| Item | Disposition |
| --- | --- |
| api#1116 (`#2150`) | Round 2 stopped with 2 dirty files (`orbit-api/dependabot-1105`): relaunch S `note-1116-r2.md` first. Then a delta review, push, Pullfrog, merge, and the API release with the manual steps (the production webhook is broken until then). |
| ui#2469 (`#2074`) | Round 20 stopped with 16 dirty files: relaunch S `note-2469-r20.md`, delta review, push. |
| ui#2475 (`#2149`) | Round 4 stopped with 3 dirty files at `91c24e7b5`: relaunch S `note-2475-r4.md`, delta review, push. |
| ui#2478 (`#2135`) | Round 2 committed `4980586da`, not pushed: delta review, resolve `PRRT_kwDOR5Siws64Hdlx` with S `reply-2478-Hdlx.md`, push. |
| ui#2464, ui#2451, ui#2476 | Rounds committed (`5b75fe303`, `fc7c0f0a9`, `3d0b39885`): one delta review each, fix BLOCKING only, push with S `body-2464-r20.md`, `body-2451-r22.md`, `body-2476-r2.md`. |
| `#2146`, `#2143` | Committed (`e8c143bf1`, `4356a934f`), not pushed: delta review, push, open the pull request (S `body-2146-r3.md`, `body-2143-r4.md`). |
| ui#2480 (`#2135`) | At `8d3174826`: one whole-diff review, Pullfrog, merge, then ui#2478. |
| ui#2473 (`#2144`) | The body holds rounds 5 and 6; a Pullfrog re-review was requested. Read the verdict, merge at the bar. |
| `#2135` baseline | Relaunch S `order-2135-baseline-r4.md` per S `result-2135-baseline.md` `## Next window` (240 min). |
| `#2152` | Not started: build after the `#2074` speed changes. |
| Releases | After api#1116: API release; then web and one Android Open plus iOS TestFlight pair carrying `#2148`, `#2131` and `#2146`. |
| ui#2453 (`#2122`) | Stacked; after `#2121`, in seven parts. |
| Research record | Save the verdict of S `speed-research/` to the brain. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Apply and build the speed orders, and drive every In flight row at once.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay was adopted; `#2151` folded into `#2074`; the ui#2473 body and re-review request; `#2152` filed; the speed research and its approval.
- Superseded: the 89% usage order (the session moved to the worker account); the full scratchpad carry (the lean carry replaces it).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
