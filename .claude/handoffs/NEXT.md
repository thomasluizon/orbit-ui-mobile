/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## The owner's instructions for this run

**Fix `#942` first**, before any other queued ticket: the Modelos row in the Criar hábito checklist block has a square, full-bleed hover fill butting against the checklist input and an empty icon slot, and the owner called it absolutely horrible. Render it as drawn on web and Android, fix the missing icon at its root, and prove the hover geometry with a layout spec.

Everything related to the redesign gets done. Every single thing. Every open redesign ticket (the spec's `### Batch R` and every other ticket whose work lands on `redesign/main` in any repository) is implemented, merged and closed, and staging runs all of it: web, API and landing released from `redesign/main`, and an internal Android build from `redesign/main` against the staging API once Batch R lands. After each batch of merged fixes, release `redesign/main` to staging and run a rendered sweep: open every screen on staging in the browser at desktop and phone width, check it against the `DESIGN.md` rules, its drawing, `BRAND.md` and the brain decisions, file what is wrong, fix it, and sweep again until a full pass finds nothing. Code-only audit agents do not count as a sweep. The redesign is done only when the board holds no open redesign ticket, every staging service runs the `redesign/main` head, and a full sweep at both widths finds nothing. THE REDESIGN GATE then stays for the owner: never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done and on staging, as above. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 153 open tickets, all 153 placed in the spec's `## The order` (0 unplaced, 0 placed twice as list items).

## In flight (verify each first)

| item | disposition |
|---|---|
| `#942` Modelos row hover and icon | not started: first ticket of the run |
| `ui#1316` (`#939`) pending skips out of all-done | one P1 (a settled skip's marker stays in cached lists); a review-batch worker was running on `ticket-939-skip-all-done-carry` (its log is the newest `#939` file in the harness's worker log directory), outcome unknown: read the worktree; carry a new commit's report into the body, resolve the thread, push. Then `#940` on `main` |
| `ui#1317` (`#930`) FAB above the notice | approved at `f1d70c04`; its new `fab-notice.spec.ts` failed at 412px; the fix commit is unpushed on `ticket-930-fab-celebration`: carry its report, push, merge on the bar |
| `ui#1313` (`#870`) calendar sync fold | approved at `30da0d09`: merge on the bar (merge-result check first if later merges overlap) |
| `ui#1320` (`#871`) Perfil Astra rows | approved at `5d205bb1`: merge on the bar |
| `ui#1318` (`#929`) weekday values, achievement names | Pullfrog commented at `1a500d7f`; copy approved: fix the findings |
| `ui#1319` (`#884`) type names | Pullfrog requested changes at `161ae2f7`; copy approved: fix the findings |
| `ui#1321` (`#894`) Astra write preview | awaiting review at `86aa95d1` |
| `ui#1322` (`#852`) Wrapped player | awaiting review at `bcfe672f`; copy approved |
| `ui#1323` (`#928`) Perfil delete icon | awaiting review at `17e67f4b` |
| `ui#1217` privacy (`#805`, `main`) | held until email runs on SES; 1 unpushed commit on `ticket-805-privacy-processors` |
| Board closures owed | `#916` (merged as `ui#1275`), `#919` (merged as `orbit-api#651`): close with `node tools/complete-ticket.mjs --issue "#N"` |
| Staging | web `8393f925` (release `redesign/main` `4871a5d5` next), API `40efecfb`, landing unchanged |
| Production | web `24160e3a`, Android 1.3.43 (102) open track, API `4c108bd0` |
| SES production access | case `179056896000159`: AWS owes the reply |
| Running workers | the `#939` review batch above; every other worker exited and delivered |
| Waiters | `wait-ci.mjs` processes from the previous session may still be alive; they end on their own |
| Stashes | none in any of the three repositories |
| Uncommitted work | none found |
| Unpushed commits | `ticket-805-privacy-processors` (1), `ticket-930-fab-celebration` (1), `ticket-939-skip-all-done-carry` (1, possibly more from the running worker); merged branches `ticket-862`, `ticket-867`, `ticket-882`, `ticket-888` only look ahead of a deleted upstream |
| Detached HEADs | the scratch worktree `integ` under an old scratchpad and `ticket-822-web-health-retry`: removable with `git worktree remove` (no `--force`) |
| Ignored files | `orbit-api/infra/local.tfvars`; Playwright Chromium in the user cache; the previous session's decision log stayed in its scratchpad, and every durable decision from it is in the spec's Batch R decisions paragraph |

## Then, in order

1. `#942`, then the in-flight rows above, top to bottom; merge each on the bar (a pull request whose base moved merges on one combined local merge-result check, spec standing rule), release `redesign/main` web and the staging API after each merged batch, then sweep at desktop and phone width.
2. The spec's `### Batch R` filed tickets in their listed order (`#941`, `#893`, `#936`, `#869`, `#868`, `#841`, `#850`, `#847`, `#851`, `#892`, `#934`, `#935`, `#932`, and the `main` tickets), within the local cap, the one-minute load average (above 20 on 18 cores means no new worker) and the admission gate (10 open pull requests plus live reservations); start a ticket whose files overlap an open pull request only after that one merges; file what each sweep finds into Batch R; repeat until the redesign is done as defined above.
3. `#940` on `main` after `#939` merges, then release production web and an Android open-track build.
4. Every other ticket whose work lands on `redesign/main` (`orbit-api` and `orbit-landing-page` included), then release every staging service from `redesign/main` and ship an internal Android build from `redesign/main` through `/android-release`.
5. The rest of `### Batch M` (the SES switch, then Resend, then `#805`).
6. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
7. Everything else in the spec's order: Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried.
- The owner's instruction (everything redesign, sweep until nothing is wrong): carried; the new `#942` instruction is added above it.
- Goal: carried, with fresh counts (153 open, 153 placed).
- In flight: `ui#1275` done (merged to `main`, released; carried into `ui#1268`). `ui#1268` done (merged `ff50e048`). `ui#1279` done (merged `f72284de`). `ui#1272` done (merged `17f62dbd`). `ui#1276` done (merged `1555ddd2`). `ui#1277` done (merged `70883662`). `ui#1278` done (merged `8511ceb1`). `orbit-api#651` done (merged; `#919` closure owed). `orbit-api#652` done (merged `a4b7ecaa`). `#879` done (merged as `ui#1288`). `ui#1217` carried. Board closures `#858`, `#883`, `#890`: done. Staging and production: carried with fresh values. SES, stashes, uncommitted work, ignored files: carried with fresh results. Prepared worktrees `ticket-907`, `ticket-922`, `ticket-885`: done (all three tickets merged).
- Step 1 (in-flight rows): carried, rewritten for the new rows. Step 2 (Batch R filed tickets): carried; `#922`, `#924`, `#907`, `#911`, `#914`, `#918`, `#917`, `#920`, `#885`, `#882`, `#849`, `#899`, `#886`, `#888`, `#877`, `#844`, `#859`, `#860`, `#861`, `#862`, `#863`, `#864`, `#866`, `#867`, `#853`, `#854`, `#873`, `#848` done (merged), the rest carried in the spec's new order. Steps 3 to 5: carried, plus step 3 for `#940`.

Every identifier here came from a previous session: treat each as a lead to verify.
