/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run. Start every worker as a harness background task with no pipe and no trailing `&`. Launch no worker while the one-minute load average is above 20; wait for it with a background until-loop.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instructions for this run

**Max priority, reported from his phone on the internal build: hover and focus are wrong everywhere in the redesign.** Every hover and pressed state is squared or partial instead of filling the control's own shape (the Android tab bar's pressed tab shows a grey square), and every input draws a double border or ring when focused (the code entry's focused box). Fix each once in the shared primitives on web and Android, sweep every surface that uses them, and prove each with a layout guard on web and a style test on Android. Also from his phone: the sign-in screen is not vertically centred as drawn; the Astra composer at the bottom of every destination is clamped (the placeholder wraps letter by letter because the three attach icons and the separate send button leave it no width) and an empty band sits above the chips on Hoje. File each report as a ticket first after checking whether `redesign/main` already fixed it, fix on both platforms, then ship an internal Android build from `redesign/main` so he sees the fixes.

He asked how to install the production app: every track ships one package, `org.useorbit.app`, so only one Orbit installs at a time. File and build a separate staging application id (for example `org.useorbit.app.staging`, its own Play Console app on internal testing) so production and staging install side by side.

Everything related to the redesign gets done. Every open redesign ticket is implemented, merged and closed, and staging runs all of it: web, API and landing released from `redesign/main`, and an internal Android build from `redesign/main` against the staging API. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, scrolled to the end, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep. THE REDESIGN GATE then stays for the owner: never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 149 open tickets, all 149 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `api#660` (`#945`, `main`) MCP Google redirect | a review-batch worker committed `be60d5fa` on `fix/ticket-945-mcp-google-redirect` (worktree `orbit-api/ticket-945-mcp-google-redirect`, log `#945-1790697194501.log` in the harness worker log directory), not pushed: read its report, merge it into the body, resolve `PRRT_kwDORKgXhc6nLrn9` and `PRRT_kwDORKgXhc6nLxig`, push, merge on the bar, apply the targeted Terraform change, release the production API, verify the Google button, file the deprecated-route removal |
| `ui#1325` (`#944`) bottom clearance | at `e98ab058`: one unresolved Pullfrog thread and an `Upgrade layout geometry` failure seen on the earlier head; read, fix, merge |
| `ui#1324` (`#942`) Modelos row | at `423669bd`, no review of this head: request one, merge |
| `ui#1318` (`#929`) weekday fit | APPROVED at `a971d0b6`, 0 threads: merge (combined merge-result check if behind) |
| `ui#1321` (`#894`) Astra previews | APPROVED at `f73647f9`, 0 threads: merge (combined merge-result check if behind) |
| Staging web | `redesign/main` `5a7d1df2` (confirm with `/api/health`) |
| Staging API | `40efecfb` |
| Production | web `057294c2`, API `a78ba3aa`, Android 1.3.43 (102) open track; internal track still 1.3.39 (98) |
| Workers and waiters | no worker; a `wait-ci.mjs` on `ui#1324` from the previous session may still be alive and ends on its own |
| Stashes | none in any of the three repositories |
| Uncommitted work | none in any worktree |
| Unpushed commits | `be60d5fa` on the `#945` branch (above); none elsewhere |
| Detached HEADs | the scratch `integ` worktree (in the previous session's scratchpad) and `ticket-822-web-health-retry`: removable with `git worktree remove` |
| Ignored files | `orbit-api/infra/local.tfvars` sets both email providers to `Ses`; the previous session's decision log stayed in its scratchpad |

## Then, in order

1. The in-flight rows above, top to bottom; merge each on the bar, release `redesign/main` web after each merged batch.
2. The owner's max-priority reports above (hover shape and double focus everywhere, sign-in centring, the clamped composer), filed then fixed on both platforms, then an internal Android build from `redesign/main`.
3. The staging application id so both builds install.
4. The spec's `### Batch R` list in its order (`#948`, `#947`, `#946`, `#940`, `#941`, `#893`, and on), plus the unfiled sweep findings listed there (file them first), then a full rendered sweep at both widths.
5. The rest of `### Batch M`: `#943`, then the retired-project list for the owner.
6. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
7. Everything else in the spec's order: Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (Google Play Console added for the staging app id).
- The owner's `#944` instruction: carried; `ui#1325` delivered, one thread and one check left.
- The owner's instruction to finish everything redesign and sweep until nothing is wrong: carried; new max-priority reports lead.
- Goal: carried, with fresh counts (149 open, 149 placed).
- In flight: `#944` carried as `ui#1325`. `ui#1324` carried (merge-forward pushed). `ui#1316` done (merged `d602b0bb`). `ui#1313` done (merged `218bf0db`). `ui#1319` done (merged `5a7d1df2`). `ui#1318` carried (approved). `ui#1321` carried (approved). `ui#1217` done (merged `057294c2`, production web released). `#943` carried. Staging web carried with the new head. Stashes, uncommitted work, unpushed commits, detached HEADs, ignored files: carried with fresh results.
- Step 1 carried; step 2 carried with `#948`, `#947`, `#946` and `#945` added; step 3 (`#940`) carried inside step 4; steps 4 to 7 carried (step 5 no longer lists `#805`, done).

Every identifier here came from a previous session: treat each as a lead to verify.
