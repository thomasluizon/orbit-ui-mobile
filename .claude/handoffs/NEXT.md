/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: its `## Standing rules`, Batch R (`### Batch R`) and `## Current state` first, and act on the in-flight items while the reading list is still small. Then, through the Obsidian MCP, the brain ADRs under `2 Areas/20-29 Orbit Engineering/Decisions/`: `Astra opens full screen and web reaches it from a sidebar row.md`, `Native mobile review answers on suggestion chips, the Avisos bell and long typed text.md`, `Onboarding shows once per install and once per new account, never on sign-out.md`, `Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `Every Astra write shows a preview the person approves first.md`, `Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before the first diff read or sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself. The owner closed the previous session chain with `/wrap-up --sleep`, so this is a new run, not a relay: `adoptRelayRun` returns false; write the run state with this session's id, `sleep: true` and the queue from `## In flight` and `### Batch R`. Start the first wakeup with `node tools/run-status.mjs --session <this session id>`.

The predecessor scratchpad (helpers, orders, notes, reports, proofs, `diag1645-sonar.md`, `diag1652b/findings.md`, the decision log) is in the system temporary directory under the previous session's id; its durable copy is `$HOME/.orbit-run-carry/scratchpad`. Restore it with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, or copy it from the old scratchpad with a carry script modelled on `carry-next36.sh` there (it also links the scratch build worktrees `base`, `mc-*`). Write any helper whose redirect target is a variable with the Write tool, and run scratchpad scripts after a `cd` into the scratchpad.

## First: the owner's staging report

The owner opened Orbit Staging web (desktop, pt-BR) and got "Foram muitas tentativas. Espere um instante." (`errors.tooManyRequests`, an API 429) on Novo hábito, and Hoje fell to "Ocorreu um erro" with "Tentar novamente" while the same notice showed. This outranks every other item. Reproduce it on staging, find which policy rejected which request in the staging API's Render logs (`DistributedRateLimitAttribute.cs:215` logs "Rate limit rejected. Policy=... PartitionKey=... Path=..."; the Render MCP needs its workspace selected with `list_workspaces` first), and fix the root cause on both platforms. Lead to verify, not a finding: the web BFF calls the API from the Render web server, so a policy partitioned by client IP puts every web user in one bucket. Also check why a 429 on a read sends Hoje to its full error state instead of retrying after `Retry-After`. File one ticket per root cause (`repo:api` and `repo:ui` as needed) and land the fix before the rest of Batch R. If it is a shipped defect on `main`, it lands on `main` first.

## Then: the in-flight work, in this order

1. Read the three worker worktrees first (`ticket-1239-day-card-hoje-link`, `ticket-1288-agenda-rebuild`, `ticket-1295-astra-full-screen`): each worker was running at the handoff with an unknown outcome. A finished worker left commits and maybe a pull request; add each pull request to the run state (`add-pr.mjs`), then prove and drive it.
2. `ui#1653` (`#1293`): read `hs-1653-sfoi.log` or rerun the head spec, then follow its `## Current state` bullet (proof, thread replies naming the fixing commits, fresh review, merge). Then `ui#1654` review batch 1 with a base merge that includes `ui#1653`.
3. `ui#1652` (`#1294`): read `diag1652b/findings.md`, then review batch 2 or push batch 1, per its bullet.
4. `ui#1645` (`#1256`): the duplication review batch in `diag1645-sonar.md`.
5. `ui#1632`, `ui#1655`, `ui#1657`, `ui#1658`: CI, fresh approval, D115 check, merge.
6. `#1305` joins `#1288`'s pull request as a review batch.
7. After the next merge batch: release `redesign/main` web to staging, ship Orbit Staging 1.3.73 (132), and sweep it with `sweep-order-1684ecee.md` retargeted at the released commit; verify the 544 versus 580 content edge lead before filing.
8. Launch as slots free, in the order of the `## Current state` launch line (`#1260` first, then `#1218` and `#1301` after `ui#1645`, `#1290`, `#1298` to `#1300`, `#1246`, `#1234`, `#1267`).
9. Then Batch R in the spec's order, then the rest of `## The order`.

## In flight

| item | disposition |
|---|---|
| Owner staging report: 429 on Novo hábito and Hoje | first, before everything (section above) |
| `ui#1632` `5652d5c5` (`#1282`) | batch 3 pushed with proof; CI, fresh approval, D115, merge |
| `ui#1645` `69d59372` (`#1256`) | approved; SonarCloud duplication red; review batch per `diag1645-sonar.md` |
| `ui#1652` `64e10a32` plus unpushed `05a91669` (`#1294`) | batch 1 red on its own week specs; read `diag1652b/findings.md` |
| `ui#1653` `de543253` (`#1293`) | red proof on base done (57 of 58); head proof pending; answer two threads |
| `ui#1654` `5abd0395` (`#1286`) | approved, conflicting; batch 1 after `ui#1653` |
| `ui#1655` `c2a53e8c` (`#1291`) | approved, proof posted; CI rerun, merge |
| `ui#1657` `176be0a5` (`#1302`) | opened; CI, Pullfrog, merge |
| `ui#1658` `617dfea6` (`#1304`) | opened on `redesign/main`; CI, Pullfrog, cache rerun, merge |
| `ui#1656` (`#1304` on `main`) | closed: `main` has no Android build workflow |
| `ui#1638`, `ui#1646`, `ui#1647` (`main`, dependabot) | later batch |
| Workers `#1239`, `#1288`, `#1295` | running at the handoff, outcome unknown; read the worktrees first |
| Diagnosis subagent for `ui#1652` | was writing `diag1652b/findings.md`; read it, or rediagnose if absent |
| Merged this chain's last session | `ui#1643` (`#1287`), `ui#1637` (`#1211`), `ui#1648` (`#1227`); tickets closed, worktrees torn down |
| Staging | API `86e7467c`, web `1684ecee`, landing `a50de090`, Orbit Staging 1.3.72 (131) on internal |
| Production | API `649c9dbe`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open |
| Open pull requests | `orbit-ui-mobile` `ui#1632`, `ui#1638`, `ui#1645` to `ui#1647`, `ui#1652` to `ui#1655`, `ui#1657`, `ui#1658`; `orbit-api` none; `orbit-landing-page` none |
| Stashes, uncommitted work | none in the three checkouts |
| Unpushed commits | `ticket-1294-semana-week-view` (`05a91669`), `ticket-1242-week-grid-one-scroller` (1, closed into `#1294`, leave it), older branches listed in the spec |
| Branches with no pull request | `fix/ticket-1304-ndk-download` (closed `ui#1656`, kept); running workers' branches until they open theirs |
| Detached HEADs | scratch build worktrees `base`, `mc-*`; none with work |
| Ignored files | the predecessor scratchpad (see Entry point) |
| Session chain | closed by the owner's handoff |
| Owner questions | none open |

## Sleep

This is an unattended run. Nobody answers questions: take every decision with the best approach and log it in the session scratchpad the moment it is made, with the time read from `date`. Keep a live wake source at the end of every turn. The owner may send screenshots or commands; answer a command before other work and file a screenshot report as new tickets, never a question back.

Carry the standing operating detail: start every worker, waiter and check as a harness background task with the Bash `timeout` at 7200000; gate each launch in the same command (`gated-launch.sh`); one hermetic Playwright run at a time under the scratchpad lock; at most three GitHub-calling waiters (fold pull requests into one waiter with several `--pr` flags); read `gh run list --commit <sha>` before calling a check red; a stale-base red never clears on a rerun, so settle it with a D115 local merge-result check; never chain a base merge and a push; check every body and comment for machine paths and dashes before posting; copy every SHA passed to `--match-head-commit` from this run's output. A relaunch within 5 minutes of a launcher's exit is refused by the admission hold. Ticket comments go through `tools/comment-ticket.mjs`, never raw `gh issue comment`. When the relay threshold fires, stop every queued gated launch whose gate has not passed.

The owner's written authorization for this run stands: merge to `main` what belongs there on green checks, an approval of the exact head and zero threads (ordinary squash, never `--admin`); merge redesign work into `redesign/main` on the same bar and release it to staging; operate Render, AWS, Cloudflare, Stripe test mode, Play Console, Pub/Sub, Firebase and GitHub through their tools and `claude-in-chrome` (one tab in the open window; when no tab group exists, drive the open window through `orca computer`); create, log and delete test habits in his staging account, never production; use a throwaway AVD only. Never create an account, type a credential or payment detail, permanently delete a project, merge `redesign/main` to `main`, or read a live secret into the transcript.

The context relay is live: at the threshold, launch nothing, drain, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`.

Owner instructions: when everything the redesign needs is done (every redesign ticket merged and closed, staging released from `redesign/main`, an Orbit Staging internal build after the last merge, a full rendered sweep finding nothing), send a push notification with `PushNotification`, make it the first line of the report, list the owner checks from the spec's Current state, and stop the redesign at THE REDESIGN GATE. Report the redesign's open ticket count separately from the board. Where a control sits is the run's call. Fix everything in the owner's latest review on both platforms. The owner said to continue the work.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's goal is the redesign done (24 open Batch R tickets listed in `## Current state`, plus `#1304`, `#1305`, the owner's 429 report and every ticket later sweeps file), then the owner told. Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Work order reconciliation against `## The order`: 152 open, 152 placed, 0 unplaced (`reconcile.mjs`; `#1305` placed in Batch R beside `#1288` this session), placed twice 0. The run ends only when the spec is done or for an external cause.

## Previous prompt, disposition

- Opening reading list, Sleep, the authorization paragraph and owner instructions: carried.
- Entry point and carry step: superseded (the owner closed the chain; restore from the durable copy).
- Step 1, check A and merges of `ui#1643`, `ui#1637`, `ui#1648`: done (layout 1,571 of 1,571; merged as `1ad9aae4`, `c46db63c`, `e802d7e5`; `#1287`, `#1211`, `#1227` closed).
- Step 2, `ui#1632` batch 3: done through the push (`5652d5c5`, body merged, proof 17 of 17 and 25 of 25); approval and merge carried (step 5).
- Step 3, `ui#1652` batch 1: carried (step 3); red on its own specs, diagnosis written to `diag1652b/`.
- Step 4, `ui#1655` proof: done (24 of 25 red, 25 of 25 green, comment posted); merge carried (step 5).
- Step 5, `ui#1645`: carried (step 4); SonarCloud duplication traced.
- Step 6, `ui#1653` proof: red half done (57 of 58 on base); head half carried (step 2).
- Step 7, `ui#1654` batch 1: carried (step 2), after `ui#1653` by decision (shared helpers and files).
- Step 8, launches `#1239`, `#1288`, `#1295`: done (launched; `#1239` relaunched to add web `ListRow` touch-press fill); outcomes carried (step 1).
- Step 9, release, Orbit Staging 1.3.73 and sweep: carried (step 7).
- Step 10, launches: `#1302` done (`ui#1657`), `#1304` done (`ui#1658` on `redesign/main`, `ui#1656` on `main` closed); the rest carried (step 8).
- Step 11, Batch R in the spec's order: carried (step 9).

Every identifier here came from a previous session: treat each as a lead to verify.
