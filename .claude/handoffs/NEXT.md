/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: the owner's latest review (fix everything in it)

The owner tested production and Orbit Staging on his phone and said to fix all of this in this session. Shipped-product defects go first. File one ticket per item with `node tools/create-ticket.mjs` (small groups, the GraphQL budget is shared), place each in the spec's `### Batch R` owner-review list, and launch workers as slots free:

1. Production Android (the latest open-track build, `main`) spins on "Entrando..." forever after Google sign-in. Reproduce on the exact shipped build on a throwaway AVD (spec Constraints recipe), fix on `main`, ship the open track through `android-release.yml`, and prove the fix on that build before calling it fixed.
2. Orbit Staging Google sign-in spun the same way on the build he tested, and a restart signed him in. 1.3.54 (113) carries `#1086`; prove it on the throwaway AVD, and if it still spins, reopen `#1086` with the new trace and fix it.
3. The Astra composer and its chips show only on Hoje; Calendário, Progresso and Perfil carry none (amend `DESIGN.md` and the canvas README in the same change, both platforms).
4. Perfil is reorganised into grouped sub-menus instead of one long page; decide the grouping with `/second-opinion` (framed as a claimed defect, so DISAGREE approves), record it, and build it on web and Android.
5. Notifications: replace "Aparelhos com aviso" and "0 de 5" with one plain "Notificações neste aparelho" switch under "Notificações"; ask for notification permission at a sensible first-use moment (he was never prompted on first open).
6. The API keys row: "Nenhuma chave ainda" is too large and nearly touches "Abrir as chaves"; fix the row so nothing collides at 412 width.
7. Orbit Pro must be easy to find: a visible entry in Perfil that opens `/upgrade` for free and trial accounts (no recurring prompt).
8. The Pro plan cards are too plain with a large empty area under the button: size them to content and give each its outcome bullets (`DESIGN.md` `## Special surfaces`, Paywall).
9. Answer him plainly in the report whether a Pro purchase on Orbit Staging charges real money (check the Play Console license-tester list and the purchase dialog's test-card wording).

Also from him: the Mac is unlocked (Play Console wizards and phone-width sweeps can run in a visible window), the Supabase project is deleted, and the two Vercel Orbit projects are deleted.

## Then: in flight, the token-cost tail, the rest of Batch R

1. `ui#1474` (`#1072`), `ui#1476` (`#995`), `ui#1477` (`#556` carry), `ui#1478` (`#1101`): approved at their heads; run one combined merge check on the current base, then merge on the bar.
2. `ui#1479` (`#1091`): first review pending; clear it and merge, then launch `#1089`.
3. Release `redesign/main` web to staging after each merged batch and ship a new Orbit Staging internal build after each batch of redesign merges.
4. `#1103` and the rest of the spec's `### Batch R`; production content rating questionnaire mirroring Orbit Staging's answers (now possible in a visible window); the Play Console test notification for `#1040`.
5. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the spec's Sweep coverage lists as not yet swept, filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
6. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
7. Then the rest of the spec's order: Batch M (the Resend cleanup after an observed SES send, then the Resend account for his delete click), Batch 0c, Batch E and Batch 0b (`#746` carry of `#903` and `#1102`), as the spec orders them. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code); for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. A locked screen hides Chrome (no resize, wizards stall); if the screen locks again, do hidden-window work only and log the rest as owed.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt.
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the token-cost tail, then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner has not yet done the license-tester purchase (`#961`) or the production Google sign-in (`#1010`); keep both on his manual list in the report.
8. Fix everything in the owner's latest review in this session.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's latest review, then the token-cost tail, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 136 open tickets, all 136 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket); the owner's latest review items are not yet filed.

## In flight

| item | disposition |
|---|---|
| `ui#1474` (`#1072`) at `9a4673ff` | approved, CI green; its merge check passed on an older base: re-check on the current base, merge |
| `ui#1476` (`#995`) at `77bc1904` | approved; merge check, merge |
| `ui#1477` (`#556` carry) at `e8823676` | approved; merge check with both harness suites (it changes a workflow), merge |
| `ui#1478` (`#1101`) at `da43265d` | approved; merge check, merge |
| `ui#1479` (`#1091`) at `51e96d10` | waiting on CI and its first review; clear it, merge, then launch `#1089` |
| `#1086` | merged into `redesign/main` and closed; device proof on the shipped Orbit Staging build is owed (owner review item 2) |
| `#1040` | production push subscription created and proven (`ack_200`); Play Console test notification owed, then close |
| Resend cleanup | waits for one observed SES sign-in send per environment; then the `infra/README.md` order |
| Production content rating | not yet resubmitted; mirror Orbit Staging (All other app types, online content, digital purchases) |
| Staging | web `4cc9865f` (current), API `72803fed`, landing current; Orbit Staging 1.3.54 (113) internal |
| Production | API `6c4e92dc`, web `a67cc942`, landing `ebbebb2a`, Android 1.3.52 (111) open |
| Running workers | none (every worker launched this session exited) |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts |
| Unpushed commits | none on any ticket branch this session used |
| Detached HEADs | scratch merge-check worktrees `mc-a`, `mc-c`, `mc-e`, `mc-f`, `chk-rd` and `questions-manual-steps`: merge-check commits only, disposable; they go with `git worktree prune` once their scratchpad directories are gone |
| Branches without a pull request | none from this session; older ticket worktrees as the spec's Current state describes |
| Merged this run, worktrees to tear down | listed in the spec's Current state, Worktrees |
| Ignored files | the session decision log stayed in the scratchpad; every durable rule and fact is in the spec |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization, owner instructions 1 to 7: carried; added the npm ci retry, the `--relaunch-reason` rule, the `main` harness argument note, the locked-screen note, Google Cloud Pub/Sub in the authorization, and owner instruction 8.
- Token-cost tickets: done for `#1092` (`ui#1465`), `#1093` (`ui#1464`), `#1094` (`ui#1463`); `#1091` carried as `ui#1479`; `#1089` carried behind it.
- Owner's bugs and Batch R: done for `#1084` (`ui#1462`), `#976` (`ui#1466`), `#1081` (`ui#1468`), `#1082` (`ui#1470`), `#1038` (`ui#1471`), `#1086` (`ui#1472`), the route name warning (`#1100`, `ui#1473`); `#995` carried as `ui#1476`; staging released and Orbit Staging 1.3.53 and 1.3.54 shipped.
- In flight: `ui#1467` (`#1019`) done; `orbit-api#682`, `#683`, `#684` done and released to production, with the `#746` carry (`orbit-api#685`) on staging; `#926` done (`ui#1469`, kept as a dispatch-only workflow on `main`); `#1087` worktree removed; Orbit Staging review passed.
- Then, in order: production content rating carried (screen was locked); full sweep carried (desktop-only pass done, found `#1102`, fixed and released); Batch M `#943` done, retired projects deleted by the owner except Resend; Batch 0c `#1040` carried, `#903` done and released; Batch 0b `#1072` carried as `ui#1474`, `#1070` backport done (`ui#1475`), `#556` carried as `ui#1477`.

Every identifier here came from a previous session: treat each as a lead to verify.
