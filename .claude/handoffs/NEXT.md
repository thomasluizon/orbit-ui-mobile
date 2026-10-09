/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs `lgx-*.log` and their `*-plain.log` copies, local spec logs `hs-*.log`, the combined check folder `check-p2`, `relay-notes-50383f7f.md`, `lead-544-580.md`, the decision log) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it skips the scratch build worktrees (`base`, `mc-*`) and links `base`. Write any helper whose redirect target is a variable with the Write tool (the guardrail refuses a redirect to `$VAR`), and run scratchpad scripts after a `cd` into the scratchpad. Use `bash` loops in a script file, not zsh word splitting. Helpers, all in the scratchpad: `log-decision.sh` (stdin, `## D<n> @NOW ...` headers); `cut-report.sh <worker log> <out>`; `batch-merge-body.sh <pr> <report> <sha prefix> [--ui-scope]` (scrub dashes and machine-path links from the report first; read its flag line, never chain `gh pr edit`); `fails.sh <log>`; `lg-cases.sh <label> <run id>`; `err-blocks.sh <plain log> <spec fragment> [lines]` (one failure block per case); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `pr-file-overlap.sh <pr> <other pr>...`; `base-delta-overlap.sh <pr>:<ci base sha>...` (D115: read the CI base with `gh api repos/thomasluizon/orbit-ui-mobile/actions/runs/<id> --jq .pull_requests[0].base.sha`); `diag-head.sh <label> <head sha> <spec>...` (builds base plus one head and runs specs once under the Playwright lock); `repeat-spec.sh <label> <worktree> <spec path> <count> [grep]`; `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>` for a full combined check; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then add a case to `launch-rb.sh` and run it; `overlap-note.sh`, `compose-note.sh <n> <worktree> fix` and `launch-new.sh <n> <worktree>` for a new ticket; `add-pr.mjs <pr> <issue> <worktree name> <branch>` and `mark-merged.mjs <pr> <merge sha> '#<issue>'` (the issue WITH its `#`) keep the run state. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. Start CI waiters with `--ceiling-minutes 90`: the default ceiling ends before Layout Guard finishes. The macOS shell has no `timeout` command: start waiters and checks without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

1. Start CI waiters (at most three, several `--pr` flags each, `--ceiling-minutes 90`) for `ui#1661`, `ui#1671`, and any pull request whose head moves. A waiter ends on a head move: restart it.
2. `ui#1653`: its batch 3 is committed locally at `51d6afdd` on `ticket-1293-selected-focus-one-indicator` and NOT pushed (the branch has no upstream configured; push with `git push origin HEAD`). Read `git show --cc 51d6afdd`: it hand-resolves this pull request's `useSyncExternalStore` theme store with `ui#1667`'s theme bootstrap. Build base plus `51d6afdd` (`diag-head.sh`) and run `selected-focus-one-indicator.spec.ts`, the light-theme and keycap specs `ui#1667` added, and every spec that reads the theme. On green, merge `report-1293rb3.md` into the body with `--ui-scope` (it has a `## Review harness` section), push, CI, fresh approval, check, merge. Then `ui#1654` batch 1.
3. `ui#1661` (`ffc4f479`) and `ui#1671` (`16e589fd`): CI, fresh Pullfrog approval of the exact head, then a full combined check of the base plus `ui#1661`, `ui#1652` and `ui#1671` (`ui#1652` shares shell files with `ui#1661`, so it never merges on p2). Repeat any red layout case that is not a filed race (`#1306`, `#1307`, `#1315`) 10 times before calling it a race. On a pass, merge `ui#1661`, then `ui#1652`, then `ui#1671`; close `#1295`, `#1294`, `#1246`; tear down their worktrees; close `#1242`, `#1245`, `#1268` as superseded per the spec.
4. Send review batches, each with the diagnosis in the spec's row for it: `ui#1664` (base merge, move `habit-detail-exact-time.spec.ts` onto the guarded clock fixture, check every spec the base added since `8d6a66af`); `ui#1673` (the Calendário frame still remounts on the newest base; find what replaces it); `ui#1674` (after `ui#1673` merges: base merge, the `profile-top-inset.spec.ts` red at pt-BR 412). Repeat `ui#1675`'s `label-fit-calendar-period-headers.spec.ts:39` at 384 en 10 times; on a race, merge it on a D115 check.
5. Launch `#1290` now (`ui#1662` is merged), `#1315` after `ui#1652`, `#1312` after `ui#1661`, `#1306` and `#1307` after `ui#1664`, `#1299` after `ui#1654`.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), run `ui#1669`'s staging sleep proof, and sweep the released commit with `sweep-order-1684ecee.md` retargeted; measure the 544 versus 580 content edge lead (the spec's `Lead from the 1684ecee sweep` row and `lead-544-580.md`) before filing it.
7. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1652` `f1b9d47e` (`#1294`) | approved, 0 threads, races only; combined check with `ui#1661` (step 3) |
| `ui#1653` pushed `29d49208`, local `51d6afdd` (`#1293`) | batch 3 committed, not pushed; prove and push (step 2) |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges |
| `ui#1661` `ffc4f479` (`#1295`) | batch 4 pushed, proven locally; CI, fresh approval, combined check, merge (step 3) |
| `ui#1664` `7f506a2b` (`#1301`) | hydration reds gone; batch 4 for the base spec on the raw clock (step 4) |
| `ui#1671` `16e589fd` (`#1246`) | batch 2 pushed, thread resolved, copy verdict posted; CI, fresh approval, check, merge (step 3) |
| `ui#1673` `92b3409c` (`#1298`) | own spec red locally and in CI; batch 2 (step 4) |
| `ui#1674` `c4eeec60` (`#1300`) | own reds reproduced locally; after `ui#1673` (step 4) |
| `ui#1675` `cecc283f` (`#1314`) | approved; one layout red to repeat (step 4) |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| Merged this session | `ui#1662` (`8a923425`, `#1260`), `ui#1667` (`6a8da968`, `#1311`); both tickets closed, both worktrees torn down |
| Filed this session | none |
| Workers, subagents, waiters | none running at handoff (workers drained; the relay tool stops this session's CI waiters on `ui#1661` and `ui#1671`) |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1652` to `ui#1654`, `ui#1661`, `ui#1664`, `ui#1671`, `ui#1673` to `ui#1675`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree clean |
| Unpushed commits | `ticket-1293-selected-focus-one-indicator` (`51d6afdd`, step 2); `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); merged tickets' local branches kept by the teardown tool |
| Detached HEADs | scratch build worktrees `base`, `mc-*` (`mc-p2`, `mc-h1661`, `mc-h1673`, `mc-h1674`); none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. A worker that puts its fixes inside a merge commit gets its `git show --cc` read and its touched specs proven locally before the push. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 144 open, 144 placed, 0 unplaced (`reconcile.mjs`); 0 placed twice by placement (ten open tickets, `#28`, `#179`, `#196`, `#237`, `#238`, `#385`, `#394`, `#418`, `#556`, `#746`, are also mentioned in a second batch as cross-references). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried; the carry script now names this session as the source, `mc-prep.sh` and `mc-check.sh` point at the session scratchpad, and the helper notes gained `err-blocks.sh`, `pr-file-overlap.sh`, `base-delta-overlap.sh`, `diag-head.sh`, the `#`-prefixed `mark-merged.mjs` argument and the 90 minute waiter ceiling.
- Step 1, CI waiters: done; carried for the new heads (step 1).
- Step 2, combined check p2: done (layout 1,733 passed, 2 real reds against `ui#1661`). Merged `ui#1662` and `ui#1667`, closed `#1260` and `#1311`, tore down both worktrees. `ui#1661` got batch 4 (pushed); `ui#1652` moved to a combined check with `ui#1661` (step 3). Closing `#1242`, `#1245`, `#1268` carried (step 3).
- Step 3, `1246rb2`: done; pushed `16e589fd`, thread resolved, copy verdict posted (step 3 merges it).
- Step 4: `ui#1653` got batch 3 (committed, held, step 2); `ui#1664`, `ui#1673`, `ui#1674`, `ui#1675` diagnosed, carried with their diagnoses (step 4).
- Step 5, launches: carried (step 5); `#1290` is now unblocked.
- Step 6, release, Orbit Staging 1.3.73 and sweep: carried (step 6), with the content edge lead's code findings added.
- Step 7, Batch R then the order: carried (step 7).

Every identifier here came from a previous session: treat each as a lead to verify.
