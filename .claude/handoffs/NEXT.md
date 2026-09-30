/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags). A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. FIRST, before any queue work: the owner reinstalled Android 1.3.45 (104) from the open track and Google sign-in still does not sign in, and onboarding does not show after the reinstall. `ui#1363` (the single code exchange) is in that build and did not fix it: after it, no Android `POST /api/auth/google/code` reached production and Sentry recorded no Android error, so the attempt stops on the phone before the exchange. Reproduce on the exact 1.3.45 build before claiming a cause (the spec's reproduce-on-the-shipped-build decision). Leads to test, not facts: Android Auto Backup (on by default) restoring the onboarding-done flag and stored state on reinstall; the removed `router.replace('/auth-callback')` now relying only on App Link delivery; the teardown clear `ui#1363` added wiping the pending Google session when the app returns from the auth tab. File with `/ticket` (`repo:ui` on `main`, plus `repo:api` if the cause is there), fix on `main`, release an Android open-track build, confirm one production sign-in logs a single exchange and `User logged in via Google`, then carry into `redesign/main`.
2. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, the Orbit Staging internal build uploaded, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report. That is THE REDESIGN GATE; stop there.
3. Onboarding ends with the free Pro trial step, or the Orbit Pro paywall for an account not on a trial; an account that already has paid Pro sees neither and onboarding finishes normally. It is `#1007`, filed with its design decisions; build it once `ui#1359` merges.
4. No recurring Orbit Pro prompt for free accounts (decided). Light-mode hover on opaque controls gets its own value that clears the 1.25:1 floor (decided, `#970` unblocked).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal after instruction 1 is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`), then the owner told (instruction 2). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 164 open tickets, all 164 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1359` (`#556` carry) at `62af2902` | extended with `#1357`, `#1364`, `#1363`, the staging forced-update link and two carry adaptations; both Pullfrog threads answered by `ui#1364`; waiting on CI and re-review. Merge on the bar, close `#889`, then release staging and ship the first Orbit Staging internal build, then `#961` |
| `ui#1356` (`#951`) at `25a9e17e` | three review batches spent (the cap); Pullfrog approved the earlier head; the whole hermetic layout project passed locally on this head; waiting on CI and review. The `redesign/main` commits since its base share none of its files |
| `ui#1365` (`#973`) at `f9c54b47` | Sonar duplication fixed (mirror pair excluded); waiting on CI and review |
| `ui#1367` (`#979`) at `68a42b26` | copy approved by `/second-opinion` (verdict posted); waiting on CI and review |
| `ui#1368` (`#983`) at `2ee53305` | in-flow back row above the cover; waiting on CI and review |
| `ui#1369` (`#977`) at `f53ae75f` | waiting on CI and review |
| `ui#1370` (`#974`) at `497075a9` | opened after a ceiling-kill continuation; waiting on CI and first review |
| `ui#1371` (`#847` create habit form) at `caedee52` | delivered after the handoff was written; waiting on CI and first review |
| `#989` worker | killed at its 45-minute ceiling with 3 commits (`684c7a00e`, `79ec64335`, `8b7206c32`), tree clean, nothing pushed (worktree `ticket-989-reload-guidance`); relaunch a continuation that verifies, pushes and opens the pull request, with `--hard-ceiling-minutes 60` |
| `#970` | unblocked by the owner's hover decision; worktree `ticket-970-hover-role` exists, clean, no commits: recompose and launch |
| Staging | web `redesign/main` `f5f8bdcf` (`aed88e68` not yet released); API `7e3a2e19` |
| Production | web `80faf22d`; API `ce78ccb4`; Android 1.3.45 (104) on the open track |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Stashes | none in `orbit-ui-mobile` or `orbit-api` |
| Uncommitted work | none; main checkouts clean |
| Unpushed commits | `fix/ticket-989-reload-guidance` (3 commits) has no upstream yet |
| Detached HEADs | none (the old scratch merge-check worktrees were removed) |
| Branches without a pull request | about thirty `orbit-ui-mobile` ticket worktrees; merged ones go with `node tools/teardown-worktree.mjs` in paced batches; several with no pull request at all hold unmerged work and stay until read |
| Ignored files | the session decision log stayed in its scratchpad |

Workers launched by this session die when the session ends: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. Instruction 1 (the Android sign-in and onboarding report).
2. The in-flight rows above, top to bottom; merge each on the bar; release `redesign/main` web (and API when it changed) to staging after each merged batch.
3. After `ui#1359` merges: the first Orbit Staging internal build from `redesign/main` through `/android-release`, then `#961` (staging billing).
4. The spec's `### Batch R` filed tickets in their order (`#970` first now that it is unblocked, then `#1008`, `#1007` once `ui#1359` merges), then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
5. When the redesign is done, tell the owner (instruction 2) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
6. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c, the rest of Batch E and Batch 0b, as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (the three-waiter folding and the cancelled-twin check added).
- Owner instruction 1 (tell the owner at the redesign gate): carried as instruction 2.
- Owner instructions 2 and 3 (onboarding trial step and paywall): done as a ticket (`#1007` filed with its decisions); the build is carried as instruction 3.
- Owner instruction 4 (Pro account sees neither): carried in instruction 3.
- Owner instruction 5 (recurring Pro prompt undecided): superseded by the owner's answer (no timed prompt, instruction 4).
- In flight: `ui#1351`, `ui#1354`, `ui#1355` done (merged); `ui#1356` carried; `ui#1357` done (merged `876f0f06`, production web released, Android 1.3.45 uploaded, `#941` closed); `ui#1358` done (merged `f5f8bdcf`, `#936` closed); `#556` carry carried (`ui#1359`); `#947` done (`ui#1361` merged, closed); `#967` done (`ui#1360` merged, closed); `#980` done (`api#670` merged, staging API released, closed); staging and production rows superseded by the rows above; stashes, uncommitted, unpushed, detached, branch and ignored rows superseded by the rows above.
- Step 0 (the two Android reports): partly done and carried as instruction 1: `#1006` (`ui#1363`) shipped in 1.3.45 but the owner still cannot sign in.
- Steps 1 to 5: carried as the order above (steps 2 to 6).

Every identifier here came from a previous session: treat each as a lead to verify.
