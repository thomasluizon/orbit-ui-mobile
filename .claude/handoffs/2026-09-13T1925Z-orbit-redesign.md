Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

Every identifier below came from a previous session. Treat each as a lead to verify, not a fact.
All of it was read live on 2026-09-13 between 19:00 and 19:25 UTC.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included. Read it rather than
assuming.

## The job

Finish the calendar, draft the 53 button labels Thomas is waiting on, then take the next screens.
`redesign/main` was `9d1bd173` when this was written. Nothing in this effort is blocked on Thomas;
every question was asked and answered on 2026-09-13.

## In flight, with a disposition for each

Recount before acting. These moved twice during the session that wrote this.

**Open pull requests, this repository (10).** Every redesign one below sits unapproved or at
CHANGES_REQUESTED, so each needs its findings cleared before it can merge.

| PR | state read 2026-09-13 | disposition |
|---|---|---|
| 939 | MERGEABLE at `552cf98d`, base `redesign/main`, no review decision | drive to merged FIRST. Two open threads: free profiles lost the calendar sync boundary, and the day panel's empty line claims something the branch never checked |
| 940 | MERGEABLE at `6796bc3a`, base `feature/ticket-56-calendar-s11`, CHANGES_REQUESTED | drive to merged AFTER 939. Do NOT retarget it to `redesign/main`; stage 12 sits on stage 11 |
| 894 | CONFLICTING at `39f52b99` | Progresso stage 3. Base-merge, clear the review, merge. `#442` closed, so the atomic repair endpoint it needed exists |
| 890 | MERGEABLE at `df2d862d` | orchestrate docs. Small, open for days. Clear the review and merge |
| 888 | CONFLICTING at `4edbfe1b`, CHANGES_REQUESTED | superseded by the merged `#496`. Close it |
| 877 | CONFLICTING at `9744cf23`, APPROVED | **never merge.** Superseded by `f22f1508`. Read `#495` first, which says 877 reintroduces the RemoteViews 873 reverted, then close it |
| 881, 801, 799, 798 | MERGEABLE, base `main` | dependabot, not redesign work. Leave them |

**Open pull requests, `orbit-api` (5):** 520, 518, 512, 511, 510, all MERGEABLE. None was opened by
this effort. Leave them, but read 511 and 510 before Perfil stage 2, which needs an API write
deployed first. **`orbit-landing-page` (5):** 78, 77, 75, 74, 73, all dependabot. Leave them.

**Open tickets this effort owns:** 40 carry `repo:ui` in `thomasluizon/orbit-tickets`. The spec's
State section names which screens they belong to. Reproduce the list with
`gh issue list --repo thomasluizon/orbit-tickets --state open --limit 100`.

**Running workers: two, both finished.** `ticket-56-calendar-s11` (log
`%TEMP%/orbit-workers/ORB-50-1789322549694.log`, last wrote 15:26 local) and
`ticket-56-calendar-s12` (log `ORB-50-1789322251924.log`, last wrote 15:42 local, work order
`prompt-940d.md`, a base merge of stage 11 into stage 12). Both worktrees are clean at their pull
request heads, so both landed their commits. Nothing to relaunch. A third worker on `#516` stopped
at 14:48; `#516` is still open, so check that worktree before assuming it finished.

**Uncommitted work and merges in progress (5 worktrees).** The main checkout on `redesign/main`
holds unrelated staged skill work, plus this handoff. `orb-70-android-widget` has 34 dirty files and
`ticket-351-primitives` has 179, both last committed 2026-08-25; `ticket-174-measure` has 1.
`ticket-53-goals-s3` is stuck mid-merge with `MERGE_HEAD` at `b86cd48d` and an empty staged diff, but
its PR 902 already merged at that exact head, so abort the merge and tear the worktree down. None of
the four blocks redesign work; leave them until the calendar is finished.

**Unpushed commits: one branch.** `feature/ticket-335-avisos` holds 11 commits ahead of
`redesign/main`. Its PR 843 merged on 2026-09-07 at `0db44bed`, the same local tip, so these are the
pre-squash originals. Nothing to save.

**Branches with no pull request, ever: 13 unmerged.** `backup/352-rebased-20260829`,
`feature/orb-70-android-widget`, `feature/ticket-351-primitives`, `feature/ticket-353-progresso`,
four `thomasluizon/ticket-50-hoje*`, and five more. Every tip is 2026-08-25 to 08-29, older than the
screens that replaced them. Leave them; audit one before deleting any. Reproduce with
`comm -23 <(git for-each-ref --format='%(refname:short)' refs/heads | sort -u) <(gh pr list --state all --limit 1000 --json headRefName --jq '.[].headRefName' | sort -u)`.

**Detached HEADs: two, both safe.** `ticket-397-accent` at `a27a8e43` and `ticket-468-control` at
`f1b2991c`. Both commits are already in `redesign/main`, so nothing is unreachable.

**Stashes: 4 here, 0 in `orbit-api`, 0 in `orbit-landing-page`.** `stash@{0}` on
`fix/ticket-416-undeclared-tokens`, `stash@{1}` and `stash@{2}` on
`thomasluizon/ticket-352-habit-detail`, `stash@{3}` on `feature/ticket-50-hoje-b`. Every owning
ticket shipped. Leave them; they hide nothing this effort needs.

**Ignored paths and the scratchpad: nothing durable.** Ignored paths are build output and caches only
(`.next`, `.turbo`, `node_modules`, `android/build`, the generated `architecture.*`). The previous
session's scratchpad held only worker work orders and pull request body drafts, all consumed. It dies
with that session; nothing was copied out because nothing needed to be.

**`orbit-api` and `orbit-landing-page` working trees: both clean.**

## What to do, in order

1. **Drive 939, then 940, then 894, then 890 to merged.** They conflict with each other as each one
   lands, so expect a base-merge round between them that finds no defects. Merge approved pairs
   together when two are clean at once.

2. **Write the accurate empty-day line** for the calendar day panel. Thomas approved Claude drafting
   it. The panel must say it has no events left to import on that day, not that his Google Calendar
   is empty: the feed only offers events not yet imported, and the panel only checked one day. Both
   locales. This unblocks 939.

3. **Draft the 53 over-cap button labels.** Thomas approved Claude drafting all 53 in both languages
   for his review, and he is waiting on it. Produce current and proposed side by side. Do NOT apply
   them and do NOT remove any suppression until he answers. Every site is greppable by
   `#74 owns this existing control copy`.

4. **Close 888 and 877** once the calendar is merged, per their rows above.

5. **Then the next screens.** All unblocked:
   - Perfil `#71` stages 6 to 9. Stage 2 is not; it needs an `orbit-api` write deployed first.
   - About, privacy, terms and support, `#73`, stages 2 to 8. The ticket names the subjects and the
     four support-picker options, so no copy question survives.
   - Wrapped `#63` stages 2 to 7. Pages turn by hand; there is no timer to build.
   - Progresso `#329` stages 3 to 7, plus its six accessibility sweeps.
   - Onboarding `#67`, all stages.
