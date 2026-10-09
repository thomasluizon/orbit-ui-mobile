/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`, `Reproduce a device bug on the exact shipped build before calling it fixed.md` and `Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. This is a context relay successor: `adoptRelayRun` adopts the run state, so do not write a fresh one. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, layout logs `lg-*.log` and `lgx-*.log`, red proof logs `red-*.log`, repeat logs `rep-*.log`, the combined check folders `check-p1` and `check-p2`, `touchprobe/`, `diag1653/findings.md`, `probe-bff-wake/`, the decision log) has its durable copy at `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`: it skips the scratch build worktrees (`base`, `mc-*`) and links `base` (built at `ddf9cae8`). Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad. `log-decision.sh` appends stdin to the decision log and replaces `@NOW` with the clock time (write every entry header as `## D<n> @NOW ...`); `cut-report.sh <worker log> <out>` cuts a worker's final report; `batch-merge-body.sh <pr> <report> <sha prefix> [--ui-scope]` merges a batch report into a pull request body and flags dashes and machine paths (the report's first line must read ``Committed `<sha>``; pass `--ui-scope` only when the batch changes a path in the UI review sweep scope, and the report then needs a `## Review harness` section); `fails.sh <log> [skip pattern]`; `lg-cases.sh <label> <run id>` (both arguments); `check-reds.sh <pr>...`; `ready.sh <since-ref> <pr>...`; `pr-overlap.sh <ticket>...` (needs `files-<n>.txt`); `red-sha.sh <label> <head sha> <helpers|-> <spec>...`; `repeat-spec.sh <label> <worktree> <spec path> <count> [grep]`; `head-build.sh`, `build-base.sh <ref>`, `mc-prep.sh <label> <sha>...` then `FORCE_CI=1 mc-check.sh <scratchpad>/mc-<label> <label>` for a full combined check; `compose-rb.sh <issue> <worktree> <round>` from `note-<issue>-<round>.md`, then add a case to `launch-rb.sh` and run it; `overlap-note.sh`, `compose-note.sh <n> <worktree> fix` and `launch-new.sh <n> <worktree>` for a new ticket; `add-pr.mjs <pr> <issue> <worktree name> <branch>` (never without arguments) and `mark-merged.mjs <pr> <merge sha> <issue>` keep the run state. Never chain `gh pr edit` after `batch-merge-body.sh`: read its flag line first. Threads are answered and resolved with `node tools/resolve-bot-thread.mjs --thread <id> --repo ui --pr <n>` (reply on stdin) before the push. The macOS shell has no `timeout` command: start waiters without it, with the Bash `timeout` at 7200000.

## Then: the in-flight work, in this order

1. Start CI waiters (at most three, several `--pr` flags each) for `ui#1652`, `ui#1653`, `ui#1661`, `ui#1662`, `ui#1664`, `ui#1667`, `ui#1673`, `ui#1674`, `ui#1675`. A waiter ends on a head move: restart it.
2. Combined check p2 (`ui#1661` `e96e2fb1`, `ui#1662` `8cb69eb6`, `ui#1667` `d4470b27`, `ui#1652` `f1b9d47e`, all approved after their pushes with 0 threads): the relay may have stopped it, so rebuild with `mc-prep.sh p2 <the four full SHAs>` and run the full `mc-check.sh`. Repeat any red layout case that is not a filed race (`#1306`, `#1307`, `#1311`, `#1315`) 10 times before calling it a race. On a pass, merge `ui#1661`, `ui#1662`, `ui#1667`, `ui#1652` at those heads; close `#1295`, `#1260`, `#1311`, `#1294`; tear down their worktrees. Then close `#1242`, `#1245`, `#1268` as superseded per the spec.
3. Compose and launch `1246rb2` on `ticket-1246-day-card-padding` (its local `8943f9f4` is committed and unpushed): keep the Android card outline change and its tests, restore the drawn `ListRow` day link on both platforms, and fit it at 320 by shortening `calendar.goToDay` in both locales (recommended "Open in Today" / "Abrir no Hoje"), approved by `/second-opinion` framed as a claimed copy defect with the verdict posted; answer `PRRT_kwDOR5Siws6qvHam`. Full reasoning in the spec's `ui#1671` row.
4. As CI settles: `ui#1653` (fresh approval of `29d49208`, check, merge, then `ui#1654` batch 1), `ui#1664` (Layout Guard must show the 18 hydration reds gone; fresh approval, check, merge, then launch `#1306` and `#1307`), `ui#1673` (fresh approval, base merge after `ui#1652`, merge), `ui#1674` (review, base merges after `ui#1652` and `ui#1661`, merge), `ui#1675` (review, merge).
5. Launch `#1315` after `ui#1652` merges; `#1290` after `ui#1662`; `#1312` after `ui#1661`; `#1299` after `ui#1654`.
6. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), run `ui#1669`'s staging sleep proof, and sweep the released commit with `sweep-order-1684ecee.md` retargeted (verify the 544 versus 580 content edge lead before filing).
7. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| `ui#1652` `f1b9d47e` (`#1294`) | base merge pushed, approved after it; CI was running; combined check p2, merge (step 2) |
| `ui#1653` `29d49208` (`#1293`) | batch 1 pushed; CI, fresh approval, check, merge (step 4) |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` merges |
| `ui#1661` `e96e2fb1` (`#1295`) | base merge pushed, approved, Layout Guard red only on `#1311`; p2, merge |
| `ui#1662` `8cb69eb6` (`#1260`) | approved, reds only `#1307`/`#1311`; p2, merge |
| `ui#1664` `7f506a2b` (`#1301`) | batch 3 pushed (shared clock for the Agenda specs); CI, fresh approval, check, merge |
| `ui#1667` `d4470b27` (`#1311`) | approved, red only `#1306`; p2, merge |
| `ui#1671` `205823a4` pushed, `8943f9f4` local (`#1246`) | batch 1 not pushed by decision; send batch 2 (step 3) |
| `ui#1673` `92b3409c` (`#1298`) | red half proven, batch 1 pushed, thread resolved; CI, fresh approval, base merge after `ui#1652`, merge |
| `ui#1674` `c4eeec60` (`#1300`) | opened, red half proven (12 cases); CI, review, base merges, merge |
| `ui#1675` `cecc283f` (`#1314`) | opened; CI, review, merge |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| Merged this session | `ui#1672` (`8d6a66af`, `#1313`), `ui#1670` (`674e15e9`, `#1267`), `ui#1668` (`17b35a4f`, `#1234`); each ticket closed and worktree torn down |
| Filed this session | `#1315` (the Calendário header resting-paint race, placed in Batch R harness); `#1314` was filed by the `#1300` worker |
| Workers, subagents, waiters | none running (drained for the relay; the relay tool stops this session's waiters; combined check p2 may still be running in the old scratchpad and is redone in step 2) |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1638`, `ui#1646`, `ui#1647`, `ui#1652` to `ui#1654`, `ui#1661`, `ui#1662`, `ui#1664`, `ui#1667`, `ui#1671`, `ui#1673` to `ui#1675`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts; every ticket worktree clean |
| Unpushed commits | `ticket-1246-day-card-padding` (6 including the base merge and `8943f9f4`, step 3); `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it) |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); merged tickets' local branches kept by the teardown tool |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Ignored files | this session's scratchpad, copied to `$HOME/.orbit-run-carry/scratchpad` |
| Run state | 25 `pullRequests` rows; one junk row with a null number is marked closed with a blocker, ignore it |
| Session chain | open; this is an automatic relay |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); pass `--hard-ceiling-minutes 75` to implementation relaunches and large batches; one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red (a cancelled duplicate beside a green rerun is not red); a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. A worker's `NEEDS_DECISION` is answered from the drawing, `DESIGN.md` and the brain decisions, logged, and relaunched with the answer. Ticket comments go through `tools/comment-ticket.mjs`, closing through `tools/complete-ticket.mjs`, new tickets through `tools/create-ticket.mjs`, never raw `gh issue`. When the relay threshold fires, stop every queued gated launch whose gate has not passed. A diagnosis subagent cannot write files: save its returned findings into the scratchpad yourself. Render tools take the one workspace `tea-ctg9ljtumphs73dep1o0`.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (the open redesign and harness tickets listed in `## Current state`, plus every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 146 open, 146 placed, 0 unplaced (`reconcile.mjs`); 0 placed twice by placement (ten open tickets, `#28`, `#179`, `#196`, `#237`, `#238`, `#385`, `#394`, `#418`, `#556`, `#746`, are also mentioned in a second batch as cross-references). The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: carried; the carry script now names this session as the source, the base build is at `ddf9cae8`, and the helper notes gained `repeat-spec.sh`, `mc-prep.sh`/`mc-check.sh`, `resolve-bot-thread.mjs` and `create-ticket.mjs`.
- Step 1, CI waiters: done; carried for the new heads (step 1).
- Step 2, `ui#1670` and `ui#1668`: done on full combined check p1; merged `674e15e9` and `17b35a4f`, `#1267` and `#1234` closed, worktrees torn down.
- Step 3, composed batches: done. `1294bm1` accepted and pushed (`f1b9d47e`); `1293rb1` accepted and pushed (`29d49208`); `1246rb1` committed but not pushed by decision (step 3 now); `#1300` launched with its overlap note and opened `ui#1674`.
- Step 4: `ui#1672` merged (`8d6a66af`, `#1313`); `ui#1661` base merge done and pushed; `ui#1673` red half proven and its thread fixed in batch 1; `ui#1664` found 18 real hydration reds and batch 3 pushed; `ui#1662`, `ui#1667` classified races-only and placed in combined check p2 (step 2). `ui#1662`'s named layout specs run through Layout Guard and the combined check instead of a separate head build.
- Step 5, release, Orbit Staging 1.3.73 and sweep: carried (step 6).
- Step 6, launches: `#1300` done; `#1314` launched (opened `ui#1675`); the rest carried (step 5).

Every identifier here came from a previous session: treat each as a lead to verify.
