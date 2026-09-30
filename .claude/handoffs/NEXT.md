/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000: the default 30-minute background limit kills a launcher and its worker mid-run. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (the spec's standing rule: every redesign ticket merged and closed, every service released to staging from `redesign/main`, the Orbit Staging internal build uploaded, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report. That is THE REDESIGN GATE; stop there.
2. New redesign requirement: onboarding ends with a step that shows the person their 7-day free Pro trial, and that step always happens, even when the person skips the rest of onboarding. File it with `/ticket` (`repo:ui` on `redesign/main`, plus an API ticket if the trial state the step needs is not in the profile contract), place it in Batch R where the spec lists it, and build it.
3. An account that is not on a trial (for example a free account that reset itself and runs onboarding again) sees a well-made Orbit Pro paywall at that step, the way good apps present one, following `DESIGN.md` `## Special surfaces` (Paywall), the Pro drawing and `BRAND.md`. Same ticket as 2 unless the work splits at a real boundary.
4. An account that already has Pro sees neither step and onboarding finishes normally (the owner left this open between nothing and an "already Pro" modal; the run decided nothing, which is reversible, and the spec records it).
5. A recurring Orbit Pro prompt for free accounts (the owner floated once a week) is undecided and stays with the owner: do not build it. The spec's `## Open questions` carries the recommendation.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`), then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 172 open tickets, all 172 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight

| item | disposition |
|---|---|
| `ui#1351` (`#850`), `ui#1354` (`#964`), `ui#1355` (`#966`) | all approved at `725228af`, `49bdc8df`, `a1643838`, 0 unresolved; one combined local merge-result check onto `redesign/main` `ea06bc35` passed every step and the hermetic layout project. If `redesign/main` has not moved and the heads are unchanged, merge all three and complete their tickets; otherwise rerun the combined check first |
| `ui#1356` (`#951`) | Pullfrog not approved: one P1 (the composer effect refocuses the field on every `inputDisabled` transition, even after the person focuses another control), and `Upgrade layout geometry` is red. One review batch fixes both |
| `ui#1357` (`#941` backport, base `main`) | Pullfrog requested changes: P1, a pending flexible skip sets `isCompleted: true` with unmet weekly progress, so the rule counts a skipped flexible habit done. The same code is merged on `redesign/main` (`ea06bc35`): fix it in `ui#1357`, carry the fix into `redesign/main`; after merge release production web (with Next.js 16.3.6 from `ui#1350`) and an Android open-track build, then close `#941` |
| `ui#1358` (`#936`) | opened at `c43f9c61`; wait for CI and review |
| `#556` carry | delivered as `ui#1359` at `dac21889` (all nine picks, including `#1342` adapted onto `redesign/main` and `#1348`); wait for CI and review, merge on the bar, close `#889`. Its merge unblocks the Orbit Staging internal build |
| `#947` worker | running at handoff (worktree `ticket-947-type-scale`, one dirty path, no upstream, log `#947-1790783953862.log`; outcome unknown) |
| `#967` worker | running at handoff (worktree `ticket-967-identity-sheet-test`, clean, no upstream, log `#967-1790784645416.log`; outcome unknown); `#1004` and `#1005` came out of the same investigation |
| `#980` worker (`orbit-api`) | running at handoff (worktree `orbit-api` `ticket-980-held-write-edits`, 39 dirty paths, no upstream, log `#980-1790784759249.log`; outcome unknown) |
| Staging | web `redesign/main` `ea06bc35`; API `e0cec58a` |
| Production | web `60a347e0` (web push live, `/sw.js` 200); API `ce78ccb4`; `main` holds unreleased `ui#1350` (Next.js 16.3.6) plus workflow-only changes |
| Stashes | none in any of the three repositories |
| Uncommitted work | the `#947` and `#980` worktrees (running workers); main checkouts clean |
| Unpushed commits | the four worker branches above have no upstream yet (running workers) |
| Detached HEADs | scratch merge-check worktree `integ-rd` under the previous session's scratchpad: removable with `git worktree remove` |
| Branches without a pull request | about fifty merged-ticket worktrees in `orbit-ui-mobile`; tear them down in small paced batches with `node tools/teardown-worktree.mjs` |
| Ignored files | the session decision log stayed in its scratchpad |

Workers launched by this session die when the session ends, the way the previous session's did: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

0. FIRST, before the in-flight rows: two live defects the owner reported on the production Android app (open track, the build he has installed; read its version from the device report or the Play Console before assuming 1.3.44 (103)). New reports on the shipped product outrank the queue. For each: reproduce on that exact shipped build (the spec's reproduce-on-the-shipped-build decision), read Sentry and the production API logs for the attempt, file a ticket with `/ticket` (`repo:ui`, on `main`, plus a `repo:api` ticket if the cause is in the API), fix it on `main`, release production (API first when it changed) and ship an Android open-track build, then carry it into `redesign/main`:
   - Google sign-in does not sign in: the person picks the Google account, nothing happens, and no error shows. Check the Android Google sign-in path Batch M moved into the API (client ids, the redirect or token exchange, the `MinSupportedVersion` expand-contract with the old Supabase path) and why a failure shows no message.
   - Onboarding appears, then vanishes and drops straight to the sign-in screen. Check the first-launch auth and onboarding routing (a session or token read that fails and signs the person out, or a redirect that fires before onboarding finishes).
1. The in-flight rows above, top to bottom; merge each on the bar; release `redesign/main` web (and API when it changed) to staging after each merged batch.
2. The `#556` carry, then the first Orbit Staging internal build from `redesign/main` through `/android-release`, then `#961` (staging billing) once that upload exists.
3. The spec's `### Batch R` filed tickets in their order (including the onboarding trial step and paywall ticket to file), then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
4. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
5. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c, the rest of Batch E and Batch 0b, as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (the 2-hour background limit and the in-command launch gate added).
- Worker engine and reviewer: done. `#1003` merged the `gpt-6.1-sol` worker config; `ui#1348`, `api#668` and `landing#97` merged the reviewer; each Pullfrog console is on "Custom (set in workflow)" and `api#669`'s review logged `model: openai/gpt-6.1-sol` and `agent: opencode`. The capacity-error relaunch rule is carried in the spec.
- In flight: `ui#1348`, `api#668`, `landing#97` done (merged); `ui#1333` done (merged, `#949` closed); `ui#1345` done (merged, `#981` closed, `#1002` closed as its duplicate); `ui#1342` done (merged, production web released, `/sw.js` 200, `#842` closed); `ui#1349` done (merged, `#969` closed; the real Chrome autofill check moves to the sweep); `api#667` done (merged, production API released, `#932` closed); `#850` carried as `ui#1351`; `#964` carried as `ui#1354`; Android 1.3.44 (103) done (uploaded to the open track); staging and production rows superseded by the rows above; stashes, uncommitted, unpushed, detached, branch and ignored rows superseded by the rows above.
- Step 1: done. Step 2 (`#1003`): done. Step 3: carried (the carry is running; the internal build and `#961` follow it). Step 4: carried (Batch R in progress: `#941`, `#951`, `#966`, `#936` have pull requests; `#947`, `#967`, `#980` running). Steps 5 to 7: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
