Two efforts are live. Read BOTH specs before anything else, in this order:

1. `.claude/specs/beta-release.md`, the fixes shipping to the Play open track off `main`.
2. `.claude/specs/orbit-redesign.md`, the screen-by-screen rebuild on `redesign/main`.

Each carries its own standing instructions, decisions, constraints and state. This prompt only says
what to do next.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` registers one.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included.

## The goal

**Finish both specs.** Neither run ends before its own spec is done.

- `beta-release.md` is done when every pull request in its State section is merged to `main` and
  `/android-release` has published to the open track.
- `orbit-redesign.md` is done when every screen ticket is closed and
  `node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. That command is
  necessary and NOT sufficient: it validates the MAPPING, never whether a surface satisfies its
  ticket, and it reads a manifest no CI job regenerates. Judge every ticket against its own
  acceptance criteria, in the tree, before closing it.

**The release outranks the redesign whenever the machine cannot run both.** Three concurrent workers
is the ceiling here; five drove it to 45% CPU with 6.6 GB free and Thomas asked for it cut. The
redesign is what stops.

Re-derive what is left rather than trusting this prompt:

    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

133 carry `repo:ui`. Eleven are redesign screens: `#53`, `#56`, `#57`, `#58`, `#63`, `#67`, `#71`,
`#73`, `#74`, `#76`, `#329`.

## In flight, with a disposition for each

**Running worker: ONE.** `#548` in `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-548-icon-suggest`,
branch `feature/ticket-548-icon-suggest`, log
`C:\Users\thoma\AppData\Local\Temp\orbit-workers\#548-1789493185021.log`. Sent to clear three
Pullfrog findings on pull request 976. **Outcome unknown.** Read that worktree first.

**Open pull requests against `main`, the release effort.** Read live 2026-09-15 at 17:49 UTC.

| pr | ticket | head | disposition |
|---|---|---|---|
| 972 | `#547` | `cd340c8b` | APPROVED, zero unresolved threads. Wait for Unit Tests, then MERGE. It is first |
| 971 | `#134` | `af696f23` | CHANGES_REQUESTED, review round already pushed. Poll the re-review, clear, merge |
| 973 | `#552` | `11ac2e7b` | CHANGES_REQUESTED, review round already pushed. Same |
| 974 | `#550` | `33b48d24` | review round already pushed. Poll, clear, merge |
| 976 | `#548` | `3f4661bf` | the running worker owns it |
| 977 | `#553` | `ca5dd1e0` | its only finding was a wrong issue link, already corrected in the body. Needs a RE-REVIEW, not a code round |
| 978 | `#554` | `26521377` | no review yet. Poll, clear, merge |

Four dependabot pull requests also sit on `main` and are not this effort.

**Open pull requests against `redesign/main`, the redesign effort.**

| pr | head | disposition |
|---|---|---|
| 969 | `9dc11daf` | About stages 6 to 8. APPROVED. Confirm at the exact head, then MERGE |
| 963 | `8d69cb53` | Wrapped stage 7. APPROVED, merge-forward landed. Re-review at that head, then merge |
| 959 | `061dddb7` | Progresso stage 5b. APPROVED, merge-forward landed, review-harness block written by hand. Poll, merge |
| 970 | `e15d5228` | `/progress` generic plus `--full`. Two real findings, no round run yet. Order a round |

**`orbit-api`:** 521 and 520 are open on `main`, each with one live P1 and an order already posted as
the newest comment on its ticket. Not part of this release, still yours to merge and deploy under
Thomas's standing instruction. Three dependabot ones sit beside them.

**Not started, release effort:** `#551`, Cloud off by default. Needs a worktree, an install, a worker.

**Not started, redesign effort:** `#545` the 196 orphaned suppressions, whose stage 1 worker was
stopped for machine load with no commits and 13 dirty files in `ticket-545-form-fields`; `#549` the
day-boundary rule; `#546` the Gate Charter that never installs `js-yaml`, which **D95 forbids this
run fixing** because every pull request here is judged by `Guards`; plus `#76` stage 9, `#56` stage
13, `#71` stage 10, `#73` stage 3, `#53`, `#74`, `#543`, `#544` and the six Progresso sweeps `#472`,
`#473`, `#476`, `#477`, `#478`, `#480`.

**Uncommitted work that matters:** `ticket-67-onboarding-s1` holds 132 staged files, +133 and
-10,822, the tour, the push prompt and the template pack step deleted on both platforms. It cannot be
committed as it stands: the root type-check fails with five `TS2554`s and the surface manifest is
untouched. The round 2 order is the newest comment on `#67`. **Drive it; do not reset it.**

**Everything else dirty is old debt and blocks nothing**: `ticket-351-primitives` 179 files,
`orb-70-android-widget` 34, `orb65-red-evidence` 4 on a detached HEAD, `ticket-174-measure` 1,
`ticket-329-progresso-s5b` 2 with 1 unpushed, `ticket-335-avisos` 11 unpushed from a squash that
landed as 843, four stashes from tickets that shipped, and three detached HEADs whose commits are
reachable. Both specs' State sections list them.

## What to do, in order

1. **Merge 972** once Unit Tests finish.
2. **Poll the re-reviews on 971, 973 and 974**, clear anything new, merge each.
3. **Re-review and merge 977**; drive **976** and **978** to approval and merge.
4. **Build `#551`**, Cloud off by default.
5. **Run `/android-release` to the open track** once every `main` pull request is merged. Tell Thomas
   that `#134` closes only when he opens the built app and taps the three-dot control on a day that
   already has completed habits, because no device repro was possible in any session.
6. **Then the redesign**, in this order: merge 969, 963 and 959; order a round on 970; relaunch `#545`
   stage 1; commit `#67` stage 1 through its round 2 order, which is the single largest suppression
   drop available; then `#549` and the rest of the list above.

## When this run is allowed to end

**Only when both specs are done.** A blocker is the next piece of work, never an ending. Waiting on CI
or a review is waiting: start the next thing while it runs. A finding too large for its pull request
becomes a ticket AND you pick it up. A missing capability is built.

The only honest early ending is external: the GPT Sol allowance is exhausted, the machine stops, or
Thomas says stop. Say which one it was, and never report it as the work being finished.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop.

Four things that cost real work on 2026-09-15:

- **Do not pass `--cloud`.** Five submissions, five empty diffs. `#551` turns it off by default.
- **`tools/list-bot-threads.mjs` refuses to run from a `redesign/main` checkout** while the release
  effort is live, because it compares `.claude/orchestrator.json` against `origin/main` and the
  redesign branch is legitimately ahead there. Read reviews with `gh api graphql` instead, or run it
  from a `main` worktree.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason` naming the new head and the new findings. A refused launch registers NO wake
  source, which is how a turn ends with none.
- **A worker that hits `KILLED_HARD_CEILING` after committing has lost nothing.** Relaunch with a
  short delivery-only order on `--tier mechanical` that forbids redoing or widening the work.

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact.
