/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`, including the owner's gate review paragraph), `## Current state` and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md`, `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad was cleared by the system; its durable copy is at `$HOME/.orbit-run-carry/scratchpad` (helpers, orders, bodies, the decision log `sleep-decisions.md`, earlier logs `prev-sleep-decisions-*.md`). Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check that `grep -n "^SP=" mc-prep.sh mc-check.sh mc-check-gated.sh gated-launch.sh prep-ticket.sh head-build.sh run-spec.sh final-build.sh` names the new scratchpad (rewrite any that do not). The scratch build worktrees (`mc-*`) are gone with the old scratchpad: run `git worktree prune` and rebuild with `head-build.sh` or `mc-prep.sh` when needed. Useful helpers: `pr-bar.sh <repo name> <pr>` (merge-bar facts), `check-reds.sh <pr>` (failed jobs with annotations), `combined-c3.sh` (the pattern for a combined merge-result check with the layout project), `reconcile.mjs` (board against the spec order). Shell caution: the guardrail refuses a redirect target holding a variable; write such scripts with the file tool.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the owner's gate review answered: the owner is retesting the whole app on Orbit Staging 1.3.80 (139) with a six-part phone checklist; every reported finding becomes a Batch R ticket and a worker at once, fixed, released to staging web and a new Orbit Staging internal build, until the owner approves. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order` (`reconcile.mjs`): 134 open, 134 placed, 0 unplaced, 0 placed twice by placement line (ten open tickets, `#28`, `#179`, `#196`, `#237`, `#238`, `#385`, `#394`, `#418`, `#556` and `#746`, are also cross-referenced in a second batch's prose). Progress: of the 22 frozen tickets plus the 9 gate tickets plus the `#1374` harness flake, 0 remain; the session before this one started at 2. The run ends only when the spec is done or for an external cause.

## Then: the in-flight work, in this order

1. Answer the owner first. The owner is testing everything on Orbit Staging and will report. For screenshots, file each broken-behaviour finding as a Batch R ticket (`tools/create-ticket.mjs`, labels `Bug`, `repo:ui` or `repo:api`, `needs:no-conversation`), place it in the spec's Batch R paragraph, and start its worker at once; polish goes to Batch 2b. On approval, record it in the spec and the brain and follow the spec's post-gate order (D103); never merge `redesign/main` to `main` without that approval.
2. The three Dependabot pull requests against `main`: `ui#1732` (GitHub Actions group), `orbit-api#712` (GitHub Actions group), `orbit-api#713` (NuGet minor and patch group, 20 updates). Read each with `pr-bar.sh`, wait for CI with `node tools/wait-ci.mjs --repo <ui|api> --pr <n> --ceiling-minutes 90`, and merge each to `main` on the bar (green checks, Pullfrog approval of the exact head, zero threads, `--match-head-commit` copied from this run's output). Then carry them into `redesign/main` through `#556` (UI) and `#746` (API).
3. When a gate fix merges: release staging web with `node tools/release-plan.mjs --environment staging --branch redesign/main`, dispatch the next Orbit Staging build to internal (1.3.81 (140) after 1.3.80 (139); derive it from `gh run list --workflow android-release.yml`), verify the Play upload step, and tell the owner what it fixes and what to retest.
4. Keep answering the owner's messages before any other work.

## In flight

| item | disposition |
|---|---|
| Owner gate retest of Orbit Staging 1.3.80 (139) | waiting on the owner; step 1 |
| `ui#1732` Dependabot, against `main` | not reviewed this session; step 2 |
| `orbit-api#712`, `orbit-api#713` Dependabot, against `main` | not reviewed this session; step 2 |
| `orbit-landing-page` pull requests | none |
| Merged this session | `ui#1723` (`a71f41c0`, `#1368`), `ui#1731` (`8a75be94`, `#1374`), `ui#1726` (`3aa6fe68`, `#1364`) |
| Tickets closed this session | `#1368`, `#1374`, `#1364` |
| Tickets filed this session | `#1374` (closed by `ui#1731`) |
| Releases this session | staging web at `3aa6fe68` (run 38338792540, `/api/health` reports that commit); Orbit Staging 1.3.80 (139) to internal from `3aa6fe68` (run 38339114363, Play upload success) |
| Staging | API `0bed2af8` (healthy), web `3aa6fe68`, landing `a50de090`, Orbit Staging 1.3.80 (139) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing released this session |
| Workers, subagents, workflows, waiters | none |
| Stashes | none in the three checkouts |
| Uncommitted work | none after this handoff commit |
| Unpushed commits | none |
| Branches with no pull request | the retained local branches of merged pull requests only; the teardown tool keeps them |
| Detached HEADs | none with work; the scratch build worktrees went with the cleared scratchpad (`git worktree prune`) |
| Old ticket worktrees | `ticket-24-*`, `ticket-299-*`, `ticket-306-*`, `ticket-589-*`, `ticket-642-*`, `ticket-647-*`, `ticket-735-*`, `ticket-769-*`, `ticket-1242-*`, `ticket-1304-*`, `ticket-390-*`: left as the spec's Worktrees paragraph says |
| Ignored files | the scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Run state | `remaining` is empty; `openOwnerQuestions` holds the gate approval |
| Staging account | only Caminhar, Ler 10 minutos and Beber água (the owner's own test may add habits) |
| Session chain | open; this is an automatic relay |
| Owner questions | the gate approval, recorded in the spec's `## Open questions` |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn while work remains. The owner is awake and testing: answer each owner message before other work, file a screenshot finding as a Batch R ticket and start its worker at once, never a question back. A progress report leads with how many redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task; gate each launch (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation launches and relaunches; a branch at its two launches needs `--relaunch-reason`; an order with a `## UI review sweep` heading launches with `--allow-subagents`, any other without; one hermetic Playwright run at a time; at most three GitHub-calling waiters, each with `--ceiling-minutes 90` because a Unit Tests or Layout Guard run lasts about an hour; read `gh run list --commit <sha>` before calling a check red, because a body edit leaves cancelled duplicate runs; a `conversation-thread-scroll.spec.ts:24` red is `#1356`: rerun the failed job once; a stale-base red never clears on a rerun; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Read every worker diff for gate edits before pushing: a carve-out added to pass a guard is a suppression and is removed. New copy is approved with `/second-opinion` framed as a claimed defect, and the verdict text is posted on the pull request verbatim. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in the owner's staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: file gate findings as tickets now and start fixing, without waiting for the testing to finish; fix the GitHub Actions failures the owner sees; no literal pt-BR translation anywhere in the app; no option row that wraps to a second line. THE REDESIGN GATE holds until the owner approves: never merge `redesign/main` to `main`. Where a control sits is the run's call.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph, the relay line and the owner instructions: carried.
- Step 1 (`mc-final` web Vitest and build): done; OVERALL fail=0.
- Steps 2 and 3 (CI and merge of `ui#1723`, close `#1368`, tear down): done; merged `a71f41c0` after one rerun of a flaky layout case, which became `#1374` and merged as `ui#1731`.
- Step 4 (`ui#1726` base merge, resolution, checks, copy approval comment, review fix body, push, merge, close `#1364`): done; merged `3aa6fe68` on a combined merge-result check.
- Step 5 (staging web, Orbit Staging 1.3.80 (139), owner report): done; the report named what it fixes and gave the retest checklist.
- Step 6 (commit the `#1373` placement): done; it was already in the committed spec.
- Step 7 (answer the owner's screenshots): carried as step 1.
- Step 8 (gate push notification and stop): done; the notification was skipped because the terminal was active, and the owner retest is under way.

Every identifier here came from a previous session: treat each as a lead to verify.
