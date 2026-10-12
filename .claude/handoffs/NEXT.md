/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`, including the owner's gate review paragraph) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Freeze the redesign at 22 tickets and send later polish past the gate.md`, `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, bodies, the decision log, the gate findings and the pt-BR audit in `ptbr/`) is live in the system temporary directory under the predecessor session and has a durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it links the scratch build worktrees `mc-five`, `mc-final`, `mc-p1723` and `mc-base3`), then check that `grep -n "^SP=" mc-prep.sh mc-check.sh mc-check-gated.sh gated-launch.sh prep-ticket.sh head-build.sh run-spec.sh final-build.sh` names the new scratchpad (rewrite any that still name an old one). New helpers: `final-build.sh <label>` (npm ci, commit a staged merge, hermetic build, whole layout project in `mc-<label>`), `resolve-1723-1726.py` (the conflict resolution for `ui#1726` after `ui#1723` merges). Shell caution: the guardrail refuses a redirect target holding a variable and a heredoc whose body holds one; write such scripts with the file tool.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the owner's gate findings fixed and on his phone: `ui#1723` and `ui#1726` merged, staging web released, Orbit Staging 1.3.80 (139) dispatched to internal, and the owner told what it fixes. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order` (`reconcile.mjs` in the scratchpad): 136 open, 136 placed, 0 unplaced, 0 placed twice. Progress: of the 22 frozen tickets plus the 9 gate tickets, 2 remain (`#1364`, `#1368`); the session before this one started at 6. The run ends only when the spec is done or for an external cause.

## Then: the in-flight work, in this order

1. Read `check-final/summary.txt` in the scratchpad. If it has no `vitest-web` and `web-build` line and no Vitest process is alive, rerun `mc-check-gated.sh <scratchpad>/mc-final final --no-layout` as a background task.
2. Start a CI waiter for `ui#1723` (`node tools/wait-ci.mjs --repo ui --pr 1723`) and read it with `pr-bar.sh`. A `calendar-day-link.spec.ts:89` or `calendar-day-habit-rows.spec.ts:26` red is a flake: rerun once; a `conversation-thread-scroll.spec.ts:24` red is `#1356`: rerun once. The body edit cancelled one Guards run; the second Guards run on `ea898402` passed.
3. Merge `ui#1723` on the bar with `--match-head-commit` copied from this run's output (`ea898402...` if unchanged). Close `#1368` with `tools/complete-ticket.mjs` and tear down `ticket-1368-ptbr-copy`.
4. `ui#1726`: in `ticket-1364-segments` (two unpushed commits `49353f6b`, `cb0c793c`), merge `origin/redesign/main`, run `python3 <scratchpad>/resolve-1723-1726.py` from the worktree root, check the result, commit the merge, run the checks (`mc-check-gated.sh <worktree> <label> --no-layout`), post the `/second-opinion` copy approval for `Open` / `Livre` (DISAGREE medium: "frequência livre" idiomatic and clear with the count controls beneath; the restored type-name guard was proven red with `Flexível`) as a comment, add a review fix section to the body (base merges, the label change, the removed guard carve-out, the evidence), check the body and the comment for machine paths and dashes, push once, wait for CI and a fresh Pullfrog approval, merge on the bar, close `#1364`, tear down the worktree.
5. Release staging web with `node tools/release-plan.mjs --environment staging --branch redesign/main` (the staging API is already at `0bed2af8`), dispatch Orbit Staging 1.3.80 (139) to internal on `redesign/main`, verify the Play upload step, then tell the owner in one short report that it carries the reviewed pt-BR copy (`#1368`) and the one-word segments (`#1364`), and what he can retest.
6. Commit the spec's `#1373` placement (already in the spec text) with the next docs commit.
7. Keep answering the owner's screenshots: each finding becomes a Batch R ticket and a worker at once.
8. Then THE REDESIGN GATE holds: when nothing of the gate fixes remains, send the push notification and stop for the owner's approval, per the standing rules.

## In flight

| item | disposition |
|---|---|
| `ui#1723` `ea898402` (`#1368` pt-BR copy) | Pullfrog approved at head, 0 threads, Guards green, Layout Guard and Unit Tests running; step 2 then 3 |
| `ui#1726` `7beccfc0` pushed (`#1364` segments) | two local unpushed commits `49353f6b`, `cb0c793c`; approval only on the old head; step 4 |
| Merged this session | `ui#1728` (`537ee855`, `#1361`), `ui#1727` (`70a7752a`, `#1365`), `ui#1729` (`3f4ca087`, `#1366`), `ui#1725` (`e5680de5`, `#1367`), `ui#1730` (`0c78a243`, `#1369`) |
| Tickets closed this session | `#1361`, `#1365`, `#1366`, `#1367`, `#1369` |
| Tickets filed this session | `#1373` (Batch 2b: Android label-fit case for the Calendários sheet sync rows) |
| Releases this session | staging web at `0c78a243` (run 38315243942, `/api/health` reports that commit); Orbit Staging 1.3.79 (138) to internal from `0c78a243` (run 38315691168, Play upload success); owner notified in the terminal |
| Staging | API `0bed2af8` (healthy), web `0c78a243`, landing `a50de090`, Orbit Staging 1.3.79 (138) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing released this session |
| Open pull requests | `orbit-ui-mobile`: `ui#1723`, `ui#1726`; `orbit-api`: none; `orbit-landing-page`: none |
| Workers, subagents, workflows | none |
| Local checks | `mc-final` unit check (web Vitest and build were running at the relay; step 1) |
| CI waiters | none live after the relay; step 2 |
| Stashes | none in the three checkouts |
| Uncommitted work | main checkout: none after this handoff commit; ticket worktrees clean |
| Unpushed commits | `ticket-1364-segments`: `49353f6b`, `cb0c793c`; none elsewhere |
| Branches with no pull request | none new |
| Detached HEADs | scratch build worktrees only (`mc-five`, `mc-final`, `mc-p1723`, `mc-base3` and older scratch merges); none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Staging account | only Caminhar, Ler 10 minutos and Beber água |
| Session chain | open; this is an automatic relay |
| Owner questions | none open; the gate approval waits on his testing |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner is awake and testing: answer each of his messages before other work, file a screenshot finding as a Batch R ticket and start its worker at once, never a question back. A progress report leads with how many redesign tickets remain and whether that fell since the last report, never with a merge count.

Carry the standing operating detail: start every worker, waiter and check as a harness background task; gate each launch (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation launches and relaunches; a branch at its two launches needs `--relaunch-reason`; a CI or harness order with no UI review sweep heading launches without `--allow-subagents`; a branch that used its two launches is finished by the orchestrator as a review fix (strings, test assertions, a regenerated manifest, a base merge) when the remaining change is mechanical; one hermetic Playwright run at a time; at most three GitHub-calling waiters; read `gh run list --commit <sha>` before calling a check red, because a body edit leaves cancelled duplicate runs; a stale-base red never clears on a rerun; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output; a shell redirect target must be a literal path. Read every worker diff for gate edits before pushing: a carve-out added to pass a guard is a suppression and is removed. A worker's `NEEDS_DECISION` on copy is answered from `BRAND.md`, `DESIGN.md` Voice and the pt-BR rule, logged, and written to the ticket as a comment before the relaunch. New copy is approved with `/second-opinion` framed as a claimed defect, and the verdict is posted on the pull request. A Surface Manifest Drift red is regenerated by the orchestrator (`node tools/surface-manifest.mjs`), with both harnesses run after it. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: file his gate findings as tickets now and start fixing, without waiting for him to finish testing; fix the GitHub Actions failures he sees; no literal pt-BR translation anywhere in the app; no option row that wraps to a second line. THE REDESIGN GATE holds until he approves: never merge `redesign/main` to `main`. Where a control sits is the run's call.

## Previous prompt, disposition

- Opening reading list, Entry point, Sleep, the authorization paragraph, the relay line and the owner instructions: carried.
- Step 1 (combined five-head layout run): done; rerun from the start, 2061 passed.
- Step 2 (CI waiters): done for `ui#1725`, `ui#1729`, `ui#1730`; carried for `ui#1723` as step 2.
- Step 3 (merge `ui#1729`, `ui#1730`, `ui#1725`, `ui#1727`, `ui#1728`): done (all five merged; `ui#1728` first on its own CI).
- Step 4 (`ui#1723` base merge, checks, spec proof, body, push): done up to the push (`Manter sincronizado` fits; body replaced; approval posted); the merge is carried as step 3.
- Step 5 (`ui#1726` last): partly done (base merged locally, the banned label fixed); carried as step 4.
- Step 6 (close tickets, tear down worktrees): done for the five merged; carried inside steps 3 and 4.
- Step 7 (staging web, internal build, owner report): done once for the five merged fixes (1.3.79 (138)); carried as step 5 for the last two.
- Step 8 (file the Android label-fit ticket): done, `#1373`.
- Steps 9 and 10 (owner screenshots, then the order after the gate): carried as steps 7 and 8.

Every identifier here came from a previous session: treat each as a lead to verify.
