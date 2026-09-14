# Orbit redesign

**At a glance:** the living spec for the redesign. One effort, one spec, updated by every `/handoff`.
Everything durable lives here; a handoff prompt carries only what to do next.

## What this is

Orbit is being rebuilt screen by screen against a granted design canvas. Every screen lands on both
web and Android together. Nothing reaches a real person until the whole redesign ships, so
`redesign/main` is the branch and `main` stays untouched.

Thirteen screens. Seven are done or retired. The rest are listed under State.

## Standing instructions from Thomas

These stay until he changes them. Keep his words.

- **2026-09-12** "finish every harness ticket, even the ones you filed today ... everytime i do a
  run, you file more harness tickets, its infinite. i want a permanent solution. then continue the
  redesign." Done. Do not file a harness ticket as a substitute for fixing something; record a real
  capability gap as a comment on the ticket that needs it.
- **2026-09-13** A progress update is in product terms. "i DONT CARE about this" said of ticket and
  PR numbers. Use `/progress`.
- **2026-09-13** Replies stay inside his writing contract. Do not send a long reply and let the Stop
  hook reject it; he sees the rejected draft and the rewrite both. Do not offload a long answer to a
  file either: "you answer normally here, without stop hook errors ... i just want you to stop
  rambling."
- **2026-09-13** Before asking him anything, run `/questions`. A question answered by the code, the
  ticket body OR ITS COMMENTS, `/brain`, or a web search is not his. "for this feature, do you
  prefer this simpler approach, or this more complete, more scalable and more correct approach" is
  never his either: the answer is always the correct one, "doesnt matter if it will add 1 million
  lines of code, if it will add changes on the other repo, WHATHEVER". More than four surviving
  questions get asked in rounds until all are answered.
- **2026-09-13** A screen question with one clearly better answer is decided, not asked. "if the
  question has two answers, one being trash and one being a lot better, just go with the better.
  ALWAYS FOLLOWING DESIGN.MD and BRAND.MD and /brain decisions." Only a real toss-up reaches him.
- **Standing** Always the best implementation, never a cheaper or partial option.
- **Standing** Copy, pricing, positioning and brand are his. Ticket `#74` owns existing copy.
- **Standing** Never boot the Android emulator. It is his visual testing surface.
- **Standing** `redesign/main` stays unprotected. Settled; never raise it.

## How the work runs

Every session enters through `/orchestrate`. Codex workers make every code change; Claude
orchestrates and never edits code. `.claude/rules/core.md` is the operating contract and carries the
rest, D89 and D90 included.

## Decisions this effort runs on

Pointers, not restatements. The reasoning lives in the ADR.
- D70: Pro is Astra without the daily ceiling; goals left the paywall. The daily summary and
  proactive check ins stayed behind the gate, and the server agrees at
  `ProcessUserChatCommand.Ai.cs:120` and `ProactiveCheckinSchedulerService.cs:58-60`.
- D92: the Gate Charter closes every gate into one registry that fails closed.
- D42: `design/canvas/` outranks `DESIGN.md` prose, except `## Information architecture` and
  `## Bans`.
- 2026-09-13: `Lint Severity` is changed-files scoped AND blocking. The charter allows only two
  scopes and forces a whole-tree job to be advisory, which would gut `#175`. A severity regression
  can only arrive through an eslint config, a `package.json` script, a workflow, or the lockfile,
  which `npm ci` installs the gate's own runtime from.
- **2026-09-14: no `orbit-api` pull request merges unattended.** The repository has no deploy
  workflow in `.github/workflows/`, so whether a push to `main` deploys is configured in the Render
  console, which an unattended run cannot read. Sleep rule 6.4 forbids touching what a real person
  sees, and rule 8 forbids assuming an external interface, so an API merge is Thomas's.

## Constraints that are not obvious from the code

- **No display-complete calendar events endpoint.** `useCalendarEvents` is the manual-import feed:
  bounded to 60 days ahead, keeps only the first occurrence of a repeating event, and strips
  already-imported ids. Recorded as a comment on ticket `#56`.
- **The calendar event feed reports the EVENT's timezone, not the account's.**
  `GoogleCalendarEventFetcher.cs:124` and `:132` format `DateTimeOffset` values in their own offset,
  and `calendarSyncEventSchema` in `packages/shared/src/types/calendar.ts` carries no offset and no
  instant, so no client can convert. Ticket `#526`, orbit-api pull request 521.
- **Listing and revoking API keys are protected by Pro entitlement only.** `GetApiKeysQuery.cs:30`
  and `RevokeApiKeyCommand.cs:22` check no step-up grant, while `CreateApiKeyCommand.cs:40-75`
  verifies and consumes one exactly once. Ticket `#529`. Until it deploys, the Perfil key surface
  cannot honestly claim its boundary.
- **No device list.** The push APIs only subscribe, unsubscribe and test, and `PushSubscription`
  carries no device name. Perfil stage 5 ships the consent question alone.
- **No `uses24HourClock` write.** It is response-only, computed at `GetProfileQuery.cs:147`. Perfil
  stage 2 needs an `orbit-api` change first, deployed before the UI.
- **No Astra eval trace.** `/api/chat` omits tool arguments, so `#26`'s assertion cannot be written
  against anything real.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree and
  looks like a stalled worker. Delete it before believing a lint error in a file the diff never
  touched.
- **`apps/mobile/__tests__/scripts/__snapshots__/widget-header.test.ts.snap` flips its line endings
  on its own.** It appeared as modified with a CRLF-only diff in three separate worktrees on
  2026-09-13. Restore it and keep it out of every commit; a `git diff --stat` printing only the
  LF-to-CRLF warning and no hunks is the tell.
- **`calendar-views.test.tsx` is green in CI and red locally.** Its
  `renders the agenda at phone width` case reads `formatAPIDate(new Date())` and never pins the
  clock, unlike every sibling in the same file. Ticket `#530`. A red local mobile suite on that one
  case is not a defect in whatever branch you are holding.
- Two local Codex workers is the cap. A third gets killed for low memory, and so does a second when
  a full test suite is running beside it.
- **A screen stage needs more than the 45 minute default ceiling.** Perfil stage 6 was killed at 55
  minutes at step 5 of 6 with both type checks passing. Pass `--hard-ceiling-minutes 75` for a screen
  stage that covers both platforms.
- The calendar stages all touch the same files, so each merge conflicts the next and costs a
  base-merge round that finds no defects.
- Worktree and branch debt is large and harmless. Read 2026-09-14: four dirty worktrees, four
  stashes, two detached HEADs whose commits are already in `redesign/main`, and one branch
  (`feature/ticket-335-avisos`) 11 commits ahead whose pull request 843 already merged at the same
  tip. None of it blocks the redesign, and none holds work that exists nowhere else.

## How to run a stage, learned 2026-09-13

- **List the open pull requests in the target repository before starting a ticket.** Ticket `#505`
  already had orbit-api pull request 518, APPROVED since 2026-09-11, and a whole worker run was spent
  producing a duplicate before anyone looked.
- **A review order names the tests that pass with the bug present.** Pullfrog repeatedly found a
  green suite hiding a live defect: About mocked `useProfile` away, the calendar revocation tests
  resolved their responses in the favourable order, and the Progresso gap tests paired an available
  offer with a zero bank the API cannot emit. Requiring a red run first is what makes the fix real.
- **Capture a test run to a file, never through `tail`.** A piped `tail -8` kept only the npm error
  footer and named no failing test, costing a full re-run.
- **A generated inventory conflict is resolved by keeping BOTH sides' deletions**, then proving it
  with `GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs`. Never regenerate it
  with a bulk eslint run.

## State

Built and merged to `redesign/main`:

- The calendar has month, week, range and agenda views, logs the last seven days, computes its
  statistics on the account timezone, and handles loading and empty months without claiming an empty
  month is a finished one.
- Perfil has its five-group frame, data export, the Astra allowance panel with both switches behind
  Pro, and the product email consent question as a real three-state question.
- Progresso exists as the fourth destination with XP and achievements.
- **About is finished** (pull request 945, merged 2026-09-13 at `e7026d8d`): the orbital mark, the
  name, the tagline, then exactly four rows in the shipping order, the version, an account email line
  for a signed-in person and none for a signed-out one, and the 412px pt-BR clipping fixed by
  structure rather than by shorter words. The public route renders without a query client.
- The Android widget is finished.
- The harness is finished: every gate self-registers or the charter reds the pull request, the lint
  gate fails closed on every unresolvable suppression target, pending lessons reach a real session,
  the drift proposer cannot invent a repeated pattern, and button labels over the cap are blocked.

In flight, read 2026-09-14. Every one of these is unapproved except 940, so each needs its findings
cleared before it can merge:

| pull request | head | base | state |
|---|---|---|---|
| ui 948, privacy and terms | `7f1fe011` | `redesign/main` | opened, review not yet read |
| ui 947, Wrapped cover | `ead94f5a` | `redesign/main` | opened, review not yet read |
| ui 946, Perfil API keys | `20d729c6` | `redesign/main` | three findings fixed, re-review pending |
| ui 940, calendar stage 12 | `7b1ef8c0` | `feature/ticket-56-calendar-s11` | APPROVED, zero threads, held behind 939 |
| ui 939, calendar stage 11 | `f1c747bb` | `redesign/main` | BLOCKED at the review bound by `#527` |
| ui 894, Progresso stage 3 | `53c49044` | `redesign/main` | blocked on `#505` deploying |
| ui 890, orchestrate docs | `df2d862d` | `redesign/main` | untouched by policy, see below |
| api 521, calendar timezone | `cc86c612` | `main` | two rounds fixed, re-review pending |
| api 518, repairable gaps | `6ac02c2a` | `main` | was APPROVED, arch map just pushed, re-review pending |

Thirty tickets carry `repo:ui` and thirty carry `repo:api`. Reproduce with
`gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 100`.

Not started or barely started:

- Perfil: stage 7 the routes group, stage 8 the ending group, stage 9 the plan gate sweep. Stage 2
  is blocked on an `orbit-api` write.
- About: stage 3 the feature guide subjects, stages 5 to 8 the support form.
- Wrapped: stages 3 to 7, everything after the cover.
- Progresso: everything after stage 3, plus six accessibility sweeps.
- Onboarding, the tour and the feature guide: nothing built.

Decided 2026-09-13, ready to build:

- Onboarding chips fill the in-flow field only; the Hoje composer chips are a separate ticket.
- The skipped onboarding ending renders its empty state with one action that creates a habit.
- Wrapped pages turn by hand: Pager's forward control, the tap zones and the keys. No timer.
- Progresso already ships as the fourth destination, so Wrapped's W5 entry at its top is unblocked.
- `#442` closed, so Progresso's multi-day gap repairs and needs no undrawn third variant.

## Pull request 890 is deliberately untouched

890 edits `.claude/skills/orchestrate/SKILL.md`, the contract a run is executing, and that skill's
own hard prohibition forbids editing it from inside a run. Its one Pullfrog finding is real and
small: the new "Who writes the fix" section attributes the actor split to D89, and D89 covers queue
invocation and capacity. The attribution belongs to the operating contract in `.claude/rules/core.md`
instead. An attended session fixes that line and merges it; an unattended one leaves it.

## Open questions

None for Thomas that block work. Two things are his and only his:

- **Merging any `orbit-api` pull request.** See the decision above. 518 and 521 are both waiting.
- **The copy he has to review**, listed under Copy waiting on Thomas.

## Copy waiting on Thomas

- **The 32 shortened control labels**, drafted in both locales as a comment on ticket `#74` on
  2026-09-13. It is 32 unique i18n keys across 58 suppression sites, not the 53 `hot.md` records,
  because pull request 927 merged 53 and more landed after it. Five of the 58 keys are already inside
  the two-word cap, so their suppression can go with no copy change. Three rows need his eye:
  `profile.proactiveAstra.title` and `profile.settingsRows.apiKeysMcp` are settings ROW titles where
  the sentence is the explanation of the switch, and `auth.signInWithGoogle` is the Google button
  whose wording Google's branding terms constrain.
- **`profile.apiKeys.unlock`**, changed on pull request 946 from "Unlock with Pro" to "See Pro" and
  "Ver Pro". `node tools/check-copy.mjs --check` refused the original as `[ai-cliche] "Unlock"`, and
  the replacement is this product's existing phrase at `profile.allowance.seePro` and
  `calendar.proBoundary.action`.
- **The calendar day panel's empty line**, now `calendar.dayDetail.noEventsToImport`: "Nothing left
  to import from Google Calendar on this day." and "Nada para importar do Google Calendar neste dia."
  It replaces a line that claimed the whole Google Calendar was empty when the panel had checked one
  day and the feed offers only events not yet imported. On pull request 939.
