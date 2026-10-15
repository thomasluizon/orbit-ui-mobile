/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`, including the owner's gate review paragraph), Batch 0b (`### Batch 0b`), `## Current state` and `## Open questions` first. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md`, `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad's durable copy is at `$HOME/.orbit-run-carry/scratchpad` (helpers, orders, notes, the decision log `sleep-decisions.md`, earlier logs `prev-sleep-decisions-*.md`, and the owner's phone checklist `orbit-staging-1.3.80-test-steps.md`). Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, then check that `grep -n "^SP=" mc-prep.sh mc-check.sh mc-check-gated.sh gated-launch.sh prep-ticket.sh head-build.sh run-spec.sh final-build.sh` names the new scratchpad (rewrite any that do not). Scratch build worktrees (`mc-*`) are not carried: run `git worktree prune` and rebuild with `head-build.sh` or `mc-prep.sh` when needed. Useful helpers: `pr-bar.sh <repo name> <pr>` (two arguments), `check-reds.sh <pr>`, `prep-ticket.sh <ui|api> <repo path> <issue> <name> <branch> <base>` (composes `prompt-<issue>.md`), `gated-launch.sh <launch-worker args>`, `reconcile.mjs`. Shell cautions: the guardrail refuses a redirect target holding a variable (write such files with the file tool); in zsh write `"${b}:path"`, never `$b:path`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the owner's gate review answered while the dependency and CI work below lands. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order` (`reconcile.mjs`): 135 open, 135 placed, 0 unplaced, 0 placed twice by placement line. Redesign tickets remaining: 0 of the 22 frozen plus the 9 gate tickets plus `#1374`, unchanged since the last report. The run ends only when the spec is done or for an external cause.

## In flight

| item | disposition |
|---|---|
| Owner gate retest of Orbit Staging 1.3.80 (139) | waiting on the owner; step 1 |
| `ui#1734` (`#1377`, Expo SDK 57 patch set, against `main`, head `2b9b4917`) | every check green except `Web image build` (public ECR 429, rerun requested in run 38758761619); Pullfrog approved; step 2 |
| `ui#1733` (`#556` carry of `a11dd817` sharp 0.35.5 and `614242ad`, against `redesign/main`, head `6ac50570`) | only `Expo SDK Pin` red; Pullfrog approved this head; step 3 |
| `orbit-api` dispatched `Mutation Testing` run 38757857217 on `main` (`2a0fd442`, `#1376`) | proof of `#1376`; three jobs green, `domain-habit-freeze` still running at relay; step 4 |
| `orbit-api` `main` commit `2a0fd442` (`orbit-api#717`) | not yet carried into `orbit-api` `redesign/main`; step 5 |
| Staging API and web releases of the dependency carries | held while the owner tests; step 6 |
| `orbit-landing-page` pull requests | none |
| Merged this session | `ui#1732` `614242ad` (main), `orbit-api#712` `c6feca06`, `#713` `bffc08fc`, `#715` `e3a7fa00`, `#717` `2a0fd442` (main); `orbit-api#714` `77323485`, `#716` `f385feeb` (redesign/main) |
| Tickets filed this session | `#1375` (closed by `orbit-api#715`, target missed, comment names `#1376`), `#1376` (open until its proof run passes), `#1377` (open, `ui#1734`) |
| Releases this session | none |
| Staging | API `0bed2af8`, web `3aa6fe68`, landing `a50de090`, Orbit Staging 1.3.80 (139) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing released |
| Workers, subagents, workflows | none live; every launched worker exited with its pull request opened |
| Waiters at relay | `wait-ci` on `ui#1734`; a background poller on run 38757857217; the relay tool stops this session's waiters, so re-arm them |
| Stashes, uncommitted work, unpushed commits | none in the three checkouts after this handoff commit; worktrees `ticket-556-carry-sharp-actions`, `ticket-1377-expo-patch-set`, `ticket-1376-mutation-domain-shards`, `ticket-1375-*`, `ticket-746-carry-*` are clean and pushed |
| Old ticket worktrees | as the spec's Worktrees paragraph says; tear down merged ones (`ticket-1375-*`, `ticket-1376-*` after its proof, `ticket-746-carry-deps-actions`, `ticket-746-carry-mutation-ceiling`) with `node tools/teardown-worktree.mjs`, one at a time |
| Run state | `remaining` holds `#1376`, `#1377`, `#556`; `openOwnerQuestions` holds the gate approval |
| Session chain | open; this is an automatic relay |

## Then, in this order

1. Answer the owner first. For screenshots, file each broken-behaviour finding as a Batch R ticket (`tools/create-ticket.mjs`, labels `Bug`, `repo:ui` or `repo:api`, `needs:no-conversation`), place it in the spec's Batch R paragraph and start its worker at once; polish goes to Batch 2b. On approval, record it in the spec and the brain and follow the spec's post-gate order (D103); never merge `redesign/main` to `main` without that approval.
2. `ui#1734`: start `node tools/wait-ci.mjs --repo ui --pr 1734 --require-check pullfrog-approval --ceiling-minutes 90` in the background; read `pr-bar.sh orbit-ui-mobile 1734`; merge to `main` on the bar with `gh pr merge --squash --match-head-commit <head copied from this run>`. If `Web image build` hits the public ECR 429 again, file a durable ticket for authenticated or mirrored base image pulls and start it.
3. `ui#1733`: in worktree `ticket-556-carry-sharp-actions` (branch `fix/ticket-556-carry-sharp-actions`, its second launch), compose a round order (`prep-ticket.sh` regenerates `prompt-556.md`; append a note in the shape of `note-556-r5.md`) to `git cherry-pick -x` the `ui#1734` merge commit, resolving `apps/mobile/package.json` and `package-lock.json` with `npx expo install --fix` against `redesign/main`'s own pins, then `CI=1 npx expo install --check`, `npm ls sharp --all`, the forced type check and the three Vitest suites; the worker pushes to the same pull request. Launch with `--tier mechanical --allow-subagents --hard-ceiling-minutes 75`. Then wait, read the bar, merge to `redesign/main`, and comment the carry state on `#556` through `tools/comment-ticket.mjs`.
4. Read run 38757857217: each `domain-*` shard green under 30 minutes and the shard mutant counts summing to 803 (`gh run view 38757857217 --repo thomasluizon/orbit-api --log --job <id>`). If it holds, close `#1376` with `tools/complete-ticket.mjs`; if not, send the worker a fix round on `main`.
5. Carry `2a0fd442` into `orbit-api` `redesign/main` through `#746` (`prep-ticket.sh api ... 746 carry-mutation-shards chore/ticket-746-carry-mutation-shards redesign/main`, then a note in the shape of `note-746-r10.md`), merge on the bar, comment on `#746`.
6. When the owner's retest ends, or with the next gate fix: release staging API and web from `redesign/main` (`node tools/release-plan.mjs --environment staging --branch redesign/main`), verify `/api/health` reports the released commits; if a gate fix changes Android, dispatch the next Orbit Staging build to internal (1.3.81 (140) after 1.3.80 (139); derive it from `gh run list --workflow android-release.yml`), verify the Play upload step and tell the owner what it fixes and what to retest.
7. Keep answering the owner's messages before any other work.

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn while work remains. The owner is awake and testing: answer each owner message before other work, file a screenshot finding as a Batch R ticket and start its worker at once, never a question back. A progress report leads with how many redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task; gate each launch (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation launches and relaunches; a branch at its two launches needs `--relaunch-reason`; an order with a `## UI review sweep` heading launches with `--allow-subagents`, any other without; a worker that runs Stryker or another long measurement launches with `--measurement`; one hermetic Playwright run at a time; at most three GitHub-calling waiters, each with `--ceiling-minutes 90` because a Unit Tests or Layout Guard run lasts about an hour; never put a `sleep` before `wait-ci.mjs`, because the Stop hook sees no wake source until it registers; read `gh run list --commit <sha>` before calling a check red, because a body edit leaves cancelled duplicate runs; a `conversation-thread-scroll.spec.ts:24` red is `#1356`: rerun the failed job once; a stale-base red never clears on a rerun; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. Read every worker diff for gate edits before pushing: a carve-out added to pass a guard is a suppression and is removed. New copy is approved with `/second-opinion` framed as a claimed defect, and the verdict text is posted on the pull request verbatim. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`. `orbit-api`'s Dependabot auto-merge workflow merges patch and minor Actions and NuGet updates itself once every required check, including `pullfrog-approval`, passes.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in the owner's staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: file gate findings as tickets now and start fixing, without waiting for the testing to finish; fix the GitHub Actions failures the owner sees; no literal pt-BR translation anywhere in the app; no option row that wraps to a second line. THE REDESIGN GATE holds until the owner approves: never merge `redesign/main` to `main`. Where a control sits is the run's call.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph, the relay line and the owner instructions: carried (the reading list adds Batch 0b; Sleep adds the `--measurement`, no-`sleep`-before-`wait-ci` and Dependabot auto-merge lines).
- Step 1 (answer the owner): carried as step 1. The owner asked for the previous checklist as a Markdown file; it is `orbit-staging-1.3.80-test-steps.md` in the scratchpad and its durable copy. No finding was reported yet.
- Step 2 (the three Dependabot pull requests and their carries): done for `ui#1732` (`614242ad`), `orbit-api#712` (`c6feca06`) and `#713` (`bffc08fc`); the `orbit-api` carry is done (`orbit-api#714`); the UI carry is `ui#1733`, carried as step 3.
- Step 3 (release after a gate fix): carried as step 6; no gate fix merged this session.
- Step 4 (keep answering the owner): carried as step 7.
- The owner instruction to fix the GitHub Actions failures the owner sees produced `#1375` and `#1376` (the nightly `orbit-api` mutation timeouts) and `#1377` (the `Expo SDK Pin` red from new Expo patches): carried as steps 2 to 5.

Every identifier here came from a previous session: treat each as a lead to verify.
