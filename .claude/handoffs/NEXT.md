/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`, including the owner's gate review paragraph and the 1.3.80 retest tickets), Batch 0b (`### Batch 0b`), `## Current state` and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md`, `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad` (helpers, orders, notes, the decision log `sleep-decisions.md`, earlier logs `prev-sleep-decisions-*.md`). Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check that `grep -n "^SP=" mc-prep.sh mc-check.sh gated-launch.sh prep-ticket.sh launch-gate.sh head-build.sh run-spec.sh` names the new scratchpad (rewrite any that do not), and that the absolute scratchpad path inside `state-add.mjs`, `state-add-api.mjs`, `state-merged.mjs`, `state-queue.mjs` and `relaunch-order.mjs` is the new one. Scratch build worktrees (`mc-*`) are not carried: run `git worktree prune` and rebuild with `head-build.sh` or `mc-prep.sh` when needed. Helpers: `pr-bar.sh <repo name> <pr>`, `check-reds.sh <pr>`, `prep-ticket.sh <ui|api> <repo path> <issue> <name> <branch> <base>` (composes `prompt-<issue>.md`), `launch-gate.sh <issue> <name>` (npm ci, then a gated UI launch with a 75 minute ceiling), `gated-launch.sh <launch-worker args>`, `relaunch-order.mjs <issue> <name>` (writes `order-<issue>-r2.md` to continue a killed launch), `state-add.mjs`, `state-merged.mjs`, `reconcile.mjs`. Shell cautions: the guardrail refuses a redirect target holding a variable (write such files with the file tool); in zsh write `"${b}:path"`, never `$b:path`; raw `gh issue edit` on the ticket repository is refused, so labels go through `tools/label-ticket.mjs`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the owner's 1.3.80 findings fixed, merged into `redesign/main`, released to staging and shipped to the owner as Orbit Staging 1.3.81 (140). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order` (`reconcile.mjs`): 148 open, 148 placed, 0 unplaced, 0 placed twice by placement line. Redesign tickets remaining: 14 (`#1381` to `#1385`, `#1387` to `#1395`), down from 15 at the last report (`#1386` merged). The run ends only when the spec is done or for an external cause.

## In flight

| item | disposition |
|---|---|
| `ui#1739` (`#1383`, typed field colour, head `ddda3154`) | Pullfrog COMMENTED: one P2 thread "Preserve Android consumed-word underlines" at `habit-understanding.tsx:136`; compose a review batch (`--review-batch`), resolve the thread, push once; its Layout Guard red was `#1356`, the failed job of run 38819914091 was rerun |
| `ui#1740` (`#1388`, Copiar removal, head `823f52a9`) | Pullfrog approved this head, 0 threads, every check green except PR Tests 38820178617 and SonarCloud, queued; re-arm its waiter and merge on the bar |
| `ui#1742` (`#1385`), `ui#1743` (`#1382`), `ui#1744` (`#1392`), `ui#1745` (`#1389`, head `31c77e76`, copy approved and posted), `ui#1746` (`#1381`), `ui#1747` (`#1387`), `ui#1748` (`#1384`), `ui#1749` (`#1390`) | open against `redesign/main`, no waiter yet; wait three at a time, answer reviews, approve new copy, merge on the bar |
| `orbit-api#719` (`#1394`, calendar sync lock, against `main`) | no waiter yet; merge on the bar, then carry into `orbit-api` `redesign/main` through `#746` |
| `#1391` (Google G mark), `#1393` (onboarding test flake), `#1395` (bad habit control announces a slip early) | not started; worktrees for `#1391` and `#1393` are ready with orders `prompt-1391.md` and `prompt-1393.md`; `#1395` needs `prep-ticket.sh` first |
| Workers, subagents, workflows, waiters | none live at the relay |
| `orbit-landing-page` pull requests | none |
| Merged this session | `main`: `ui#1734` `22a320cd`, `ui#1736` `6322ba78`, `ui#1738` `c888f9f1`; `redesign/main`: `ui#1733` `9ee390af`, `ui#1735` `0e286400`, `ui#1737` `71b670e3`, `ui#1741` `62ad79ed`; `orbit-api` `redesign/main`: `orbit-api#718` `5797717a` |
| Tickets filed this session | `#1378`, `#1379`, `#1380` (all closed), `#1381` to `#1395` (`#1386` closed) |
| Releases this session | none; staging API `0bed2af8`, web `3aa6fe68`, landing `a50de090`, Orbit Staging 1.3.80 (139) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing released |
| The owner's staging account | lifetime Pro since this session (`IsLifetimePro = true` on the staging row) |
| Stashes, uncommitted work, unpushed commits | none in the three checkouts after this handoff commit; every open pull request's worktree is clean and pushed |
| Old ticket worktrees | tear down each merged ticket's worktree with `node tools/teardown-worktree.mjs`, one at a time (`ticket-1377-*`, `ticket-1378-*`, `ticket-1379-*`, `ticket-746-carry-*` are due) |
| Run state | `remaining` holds `#556` and `#1381` to `#1395` without `#1386`; `openOwnerQuestions` holds the gate approval |
| Session chain | open; this is an automatic relay |

## Then, in this order

1. Answer the owner first. For screenshots, file each finding as a Batch R ticket (`tools/create-ticket.mjs`, labels `Bug`, `repo:ui` or `repo:api`, `needs:no-conversation`), place it in the spec's Batch R paragraph and start its worker at once; the owner asked for every finding to be fixed. On approval, record it in the spec and the brain and follow the spec's post-gate order (D103); never merge `redesign/main` to `main` without that approval.
2. Launch `#1391`, `#1393` and `#1395` (`launch-gate.sh <issue> <name>`; `#1395` after `prep-ticket.sh ui ... 1395 bad-habit-slip-state fix/ticket-1395-bad-habit-slip-state redesign/main`).
3. Drive the eleven open pull requests to merge: `ui#1740` first (re-arm `node tools/wait-ci.mjs --repo ui --pr 1740 --require-check pullfrog-approval --ceiling-minutes 90`), then a review batch for `ui#1739`, then the rest three waiters at a time. Read each diff for gate edits before a push. New copy (`ui#1742`, `ui#1744`, `ui#1747`, `ui#1749` add strings) needs a `/second-opinion` approval posted verbatim before merge. Close each ticket with `tools/complete-ticket.mjs` after a comment, because `Fixes` does not close on `redesign/main`. A pull request whose base moved merges at its approved head only when the base delta shares no file with it; otherwise run the combined check from the spec.
4. After `orbit-api#719` merges on `main`, carry it into `orbit-api` `redesign/main` through `#746`.
5. When the wave has merged (or with each gate fix if the owner is waiting): release staging API and web from `redesign/main` (`node tools/release-plan.mjs --environment staging --branch redesign/main`), verify `/api/health` reports the released commits, dispatch Orbit Staging 1.3.81 (140) to internal (derive it from `gh run list --workflow android-release.yml`), verify the Play upload step, then tell the owner what each fix changes and what to retest.
6. Keep answering the owner's messages before any other work.

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn while work remains. The owner is awake and testing: answer each owner message before other work, file a screenshot finding as a Batch R ticket and start its worker at once, never a question back. A progress report leads with how many redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task; gate each launch (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation launches and relaunches; a worker killed at its ceiling with commits is relaunched at once with `relaunch-order.mjs` (D104); a branch at its two launches needs `--relaunch-reason`; an order with a `## UI review sweep` heading launches with `--allow-subagents`, any other without; a worker that runs Stryker or another long measurement launches with `--measurement`; one hermetic Playwright run at a time; at most three GitHub-calling waiters, each with `--ceiling-minutes 90`; never put a `sleep` before `wait-ci.mjs`; read `gh run list --commit <sha>` before calling a check red, because a body edit leaves cancelled duplicate runs; a `conversation-thread-scroll.spec.ts:24` red is `#1356`: rerun the failed job once; a stale-base red never clears on a rerun; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output; a worker that exits can leave its full web suite running: stop leftover `vitest` processes in its worktree. Read every worker diff for gate edits before pushing: a carve-out added to pass a guard is a suppression and is removed. New copy is approved with `/second-opinion` framed as a claimed defect, and the verdict text is posted on the pull request verbatim. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, labels through `tools/label-ticket.mjs`. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`. `orbit-api`'s Dependabot auto-merge workflow merges patch and minor Actions and NuGet updates itself once every required check passes.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in the owner's staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: file gate findings as tickets now and start fixing, without waiting for the testing to finish; fix every finding the owner reports; fix the GitHub Actions failures the owner sees; no literal pt-BR translation anywhere in the app; no option row that wraps to a second line; on wide Android windows (foldables, tablets) content is centred and actions stay small. THE REDESIGN GATE holds until the owner approves: never merge `redesign/main` to `main`. Where a control sits is the run's call.

## Previous prompt, disposition

- Reading list, Entry point, Sleep, authorization, relay line and owner instructions: carried (owner instructions add "fix every finding" and the wide-window rule from the owner's 1.3.80 screenshots; Sleep adds the relaunch, leftover `vitest` and `label-ticket.mjs` lines).
- Step 1 (answer the owner): carried as step 1. The owner sent nineteen screenshots: filed as `#1381` to `#1392`, workers started. The owner also asked for lifetime Pro on the staging account: done.
- Step 2 (`ui#1734`): done, merged `22a320cd`; the ECR 429 repeated, so `#1379` was filed and merged (`ui#1736`, `6322ba78`, the GHCR base image), with its review gap fixed as `#1380` (`ui#1738`).
- Step 3 (`ui#1733`): done, merged `9ee390af`; later carry `ui#1737` `71b670e3`.
- Step 4 (run 38757857217, `#1376`): done, closed (803 mutants, both shards green).
- Step 5 (carry `2a0fd442` through `#746`): done, `orbit-api#718` `5797717a`.
- Step 6 (staging release and Orbit Staging 1.3.81): carried as step 5; not yet run because the fixes are still in review.
- Step 7 (keep answering the owner): carried as step 6.

Every identifier here came from a previous session: treat each as a lead to verify.
