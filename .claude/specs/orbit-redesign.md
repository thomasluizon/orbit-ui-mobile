# Orbit redesign

**At a glance:** the living spec for the redesign. One effort, one spec, updated by every `/handoff`.
Everything durable lives here; a handoff prompt carries only what to do next.

## What this is

Orbit is being rebuilt screen by screen against a granted design canvas. Every screen lands on both
web and Android together. Nothing reaches a real person until the whole redesign ships, so
`redesign/main` is the branch and `main` stays untouched.

Thirteen screens. Six are done or retired. The rest are listed under State.

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

## Constraints that are not obvious from the code

- **No display-complete calendar events endpoint.** `useCalendarEvents` is the manual-import feed:
  bounded to 60 days ahead, keeps only the first occurrence of a repeating event, and strips
  already-imported ids. Recorded as a comment on ticket `#56`.
- **No device list.** The push APIs only subscribe, unsubscribe and test, and `PushSubscription`
  carries no device name. Perfil stage 5 ships the consent question alone.
- **No `uses24HourClock` write.** It is response-only, computed at `GetProfileQuery.cs:147`. Perfil
  stage 2 needs an `orbit-api` change first, deployed before the UI.
- **No Astra eval trace.** `/api/chat` omits tool arguments, so `#26`'s assertion cannot be written
  against anything real.
- A stale eslint cache at `apps/mobile/.expo/cache/eslint` blocks every commit in a worktree and
  looks like a stalled worker. Delete it before believing a lint error in a file the diff never
  touched.
- Two local Codex workers is the cap. Three get killed for low memory.
- The calendar stages all touch the same files, so each merge conflicts the next and costs a
  base-merge round that finds no defects.
- Worktree and branch debt is large and harmless. Read 2026-09-13: four dirty worktrees, one stuck
  mid-merge whose pull request already merged, four stashes, two detached HEADs whose commits are
  already in `redesign/main`, and 13 branches that never had a pull request. Every owning ticket
  shipped. None of it blocks the redesign, and none of it holds work that exists nowhere else.

## State

Built and merged to `redesign/main`:

- The calendar has month, week, range and agenda views, logs the last seven days, computes its
  statistics on the account timezone, and handles loading and empty months without claiming an empty
  month is a finished one.
- Perfil has its five-group frame, data export, the Astra allowance panel with both switches behind
  Pro, and the product email consent question as a real three-state question.
- Progresso exists as the fourth destination with XP and achievements.
- The Android widget is finished.
- The harness is finished: every gate self-registers or the charter reds the pull request, the lint
  gate fails closed on every unresolvable suppression target, pending lessons reach a real session,
  the drift proposer cannot invent a repeated pattern, and button labels over the cap are blocked.

In flight, read 2026-09-13:

- Google events beside calendar habits (pull request 939, stage 11) and the Pro sync boundary
  (pull request 940, stage 12, stacked on 939). Both mid review; 940 sits at CHANGES_REQUESTED.
- Progresso stage 3, pull request 894, conflicting.
- Forty tickets carry `repo:ui` and are open. They belong to the screens listed below.

Not started or barely started:

- Perfil: the you-group rows, API keys, the routes group, the ending group, the plan gate sweep.
- About, privacy, terms and the support form: everything after deleting three dead guide entries.
- Wrapped: everything after deleting the old insights routes.
- Progresso: the streak repair surface and everything after it, plus six accessibility sweeps.
- Onboarding, the tour and the feature guide: unblocked as of 2026-09-13, nothing built yet.

Decided 2026-09-13, ready to build:

- Onboarding chips fill the in-flow field only; the Hoje composer chips are a separate ticket.
- The skipped onboarding ending renders its empty state with one action that creates a habit.
- Wrapped pages turn by hand: Pager's forward control, the tap zones and the keys. No timer.
- Progresso already ships as the fourth destination, so Wrapped's W5 entry at its top is unblocked.
- `#442` closed, so Progresso's multi-day gap repairs and needs no undrawn third variant.

## Open questions

None. Every question was asked and answered on 2026-09-13, or settled from its own source. Nothing
in this effort is waiting on Thomas.

Settled without asking, because the source already answered it or one answer was clearly better
against `DESIGN.md`, `BRAND.md`, the canvas and the brain. Each is a comment on its ticket.

- Onboarding chips: the ticket body already answered it. Chips exist above the Hoje composer AND in
  the flow; `#67` builds only the in-flow one.
- Onboarding skipped ending: renders its empty state with one action that creates a habit. A dead
  end loses to a way forward.
- Wrapped paging: MANUAL. Pager's forward control, the tap zones and the keys; no timer. I first
  decided auto-advance from the phrase "a paused timeline" and was wrong: read in full that sentence
  is about a paused CSS animation, and the body says "the person turns each page by hand".
- Which ticket delivers Progresso: already shipped as the fourth destination, so `#63`'s W5 entry is
  unblocked.
- Progresso's multi-day gap state: `#442` closed and the atomic repair endpoint exists, so the
  undrawn third variant is no longer needed.

Answered 2026-09-13 by Thomas, now work rather than questions:

- The 53 over-cap button labels: Claude drafts all 53 in both languages, Thomas reviews, then every inline suppression goes.
- The calendar day panel's false "No upcoming events found in your Google Calendar": Claude drafts the accurate line and its Portuguese, Thomas approves. The panel only checked one day, and the feed only offers events left to import.
