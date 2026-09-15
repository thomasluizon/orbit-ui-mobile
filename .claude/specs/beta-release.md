# The beta release off `main`

**At a glance:** the living spec for the fixes that ship to the Play open track off `main`, separate
from the redesign. One effort, one spec, updated by every `/handoff`.

## What this is

Orbit's Android open beta runs off `main`. Every UI pull request has targeted `redesign/main` since
the redesign began, so for weeks nothing reached the people using the app. On 2026-09-15 Thomas
reported four live defects in one sitting and asked for them fixed, merged to `main`, and shipped.

This effort is that release: the defects a person on the beta can actually hit, merged to `main`,
followed by an open-track release through `/android-release`.

`.github/workflows/redesign-drift.yml` merges `main` into `redesign/main`, so anything landed here
reaches the redesign without a second port. The redesign itself is a different effort with its own
spec at `.claude/specs/orbit-redesign.md`.

## How the work runs

Every session enters through `/orchestrate`, or `/sleep` when it is unattended. Codex workers make
every code change; Claude orchestrates and never edits code. `.claude/rules/core.md` carries the
operating contract.

**The one thing that differs from the redesign effort: these pull requests target `main`.** The
standing rule "never merge to UI main during the redesign" is suspended for this effort by Thomas's
2026-09-15 instruction, and only for it.

## Standing instructions from Thomas, in his words

- **2026-09-15** "i want the 3 changes i asked with PRs created, reviewed by pullfrog, approved,
  merged to main, and after the 3 are merged to main, run a new release to the open track using
  /android-release". The set grew to seven during the session.
- **2026-09-15** "i want the backlog triaged for the same release. and i want all of the
  redesign/main fixes (that are not related to the redesign itself) shipped now on main, you can
  cherry pick or whathever is best".
- **2026-09-15** "i want those running in parallel, just use worktrees, whatever". Supersedes the
  one-local-worker cap for this effort. **Narrowed the same day** by "the pc is very slow, maybe too
  many workers, fix this": five concurrent workers drove the machine to 45% CPU and 6.6 GB free.
  **Three is the working ceiling on this machine**, and the redesign is what gets stopped first.
- **2026-09-15** "if cloud is bugged, just remove this funcionality. no need to delete everything,
  just disable it by default". Ticket `#551`.
- **2026-09-15** "yes, edit, duplicate, move, add sub habit, delete, etc, everything needs to be
  always available no matter the day. the others you can gate, just make it right". Ticket `#549`,
  which is redesign-only.

## Decisions this effort runs on

- **Target `main`, let drift carry it forward.** Rejected: landing on `redesign/main` and porting
  later, which is what created the backlog in the first place.
- **The unit of triage is the DEFECT, not the commit.** A first pass filtered the 269 commits
  `main` is missing by path and ticket number and returned 139 candidates; reading them showed most
  were redesign screens citing a pull request number rather than a ticket. Commit subjects cannot
  carry that decision. The verdict list that worked ran against closed `Bug` tickets and asked, for
  each, whether the defect still reproduces on `main`.
- **`#134`'s documented root cause was wrong, and that is recorded on the ticket.**
  `apps/mobile/CLAUDE.md:32` blames a missing react-native-screens patch for wedging every Android RN
  Modal. That patch, fetched in full, touches only `ios/RNSScreenStack.mm` and
  `ios/integrations/RNSDismissibleModalProtocol.h`, and Orbit ships Android only. GPT-5.6 Sol agreed
  independently through `/second-opinion`, confidence high. The real defect on `main` is the nested
  press target plus the 500ms `menuActivityAt` clock guard, which is Hypothesis 2 and which the
  redesign had already fixed by making the targets siblings.
- **Do not switch sheet library.** Settled 2026-08-05 and unchanged: `@gorhom/bottom-sheet` is banned
  by ESLint `local/no-gorhom-sheet` because its `present()` and portal silently no-op on the New
  Architecture in release builds. TrueSheet stays.
- **`#550` needs no API change.** `AuthSessionService.RefreshSessionAsync` already rotates the refresh
  token and pushes its expiry forward on every use, and mobile already refreshes on a 401. Rejected:
  an unexpiring access token, which cannot be revoked or rotated.
- **`#548` reuses `/api/habits/suggest-setup`.** It is metered by `TryConsumeAiMessage` and cached per
  user, title and language for an hour, so the icon-only press costs the same one message and hits
  the cache when the full button ran first. Rejected: a second endpoint, and a local keyword-to-emoji
  heuristic beside the real suggestion engine.

## Constraints that are not obvious from the code

- **`apps/mobile/android/` is NOT tracked.** `git ls-files apps/mobile/android` returns nothing. It is
  Expo prebuild output, so a native fix belongs in `app.json`, `app.config.js` or a config plugin.
  A change made in the generated files looks fixed locally and ships broken.
- **`Contract Drift` compares the committed Zod snapshot against `orbit-api` main, so it rots on its
  own.** It was red on `main` itself on 2026-09-15 and blocked every pull request until `#555` merged
  as `d12d1772`. Expect it again whenever `orbit-api` moves. The fix is
  `npm run generate:zod -w @orbit/shared` plus a judgement pass on whether Orbit consumes what
  changed.
- **`tools/list-bot-threads.mjs` refuses to run from a `redesign/main` checkout while this effort is
  live.** It compares `.claude/orchestrator.json` against `origin/main`, and the redesign branch is
  legitimately ahead there, so the guard reads the checkout as stale. Read reviews through
  `gh api graphql` instead, or run the tool from a `main` worktree.
- **`#540` does NOT affect the beta.** `main` carries zero ICU plural expressions and `redesign/main`
  carries 14, so the Android plural defect exists only where the plurals were introduced. An earlier
  claim in this session that the beta was shipping garbled plurals was wrong.
- **A worker that hits `KILLED_HARD_CEILING` after committing has lost nothing.** Two did on
  2026-09-15 with clean trees. Relaunch with a short delivery-only order that forbids redoing or
  widening the work, on `--tier mechanical`.
- **Cloud returned an empty diff five times out of five** on 2026-09-15. `#551` makes it off by
  default. Until that lands, do not use `--cloud`.

## State

Read live 2026-09-15 at 18:00 UTC. `main` is `d12d1772`.

### Merged

`#555` as pull request 975, the API contract snapshot re-baseline. It was the blocker for everything
else.

### Open pull requests, all against `main`

Re-derive with `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --base main`.

| pull request | ticket | what it does |
|---|---|---|
| 971 | `#134` | the habit row's three-dot control gets its own press target |
| 972 | `#547` | show completed lists only what was completed on the viewed day |
| 973 | `#552` | the offline queue stops spinning and reaches a terminal state |
| 974 | `#550` | the web app renews its session instead of signing you out |
| 976 | `#548` | a control that fills only the habit icon |
| 977 | `#553` | the two Play warnings, edge-to-edge attributes and the portrait lock |
| 978 | `#554` | the ten ported defects from the backlog triage |

972 was approved at head `cd340c8b` with zero unresolved threads. 971, 973 and 974 each had a review
round pushed and need a re-review. 977's only finding was a wrong issue link, corrected in the body,
so it needs a re-review and no code round. 978 had no review yet.

Four dependabot pull requests also sit on `main` and are not this effort.

### The backlog triage result

`#554` produced a verdict for all 97 `repo:ui` + `Bug` tickets closed after 2026-08-05:
**PORT 10, GONE 14, REDESIGN 15, HARNESS 58.** Pull request 978 ports all ten. The full verdict list
with a file reference each is a comment on `#554`.

### Not started

- `#551`, Cloud off by default.
- `#549`, the day-boundary rule that switches off every habit action on a day older than seven days.
  **Redesign-only**: `getTodayBoundary` has no caller in `apps/web` or `apps/mobile` on `main`.

## Open questions

**None are his.** One decision may return: whether large screens get a layout of their own or simply
have to work in the one they have. `#553` delivers the second, which is what the Play warning
requires; the first is design direction and is his alone.

## The release

After every pull request above merges, run `/android-release` to the open track. It owns the version
and versionCode bump. `#134` cannot be closed by that release on its own: no device repro was
possible in any session, so its closing evidence is Thomas opening the built app and tapping the
three-dot control on a day that already has completed habits.
