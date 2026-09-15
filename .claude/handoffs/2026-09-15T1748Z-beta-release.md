Read `.claude/specs/beta-release.md` first. It carries the standing instructions, the decisions, the
constraints and the state. This prompt only says what to do next.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` registers one; `submit-cloud-worker.mjs` does
too, but Cloud is unusable, so in practice it is `launch-worker.mjs`.

`.claude/rules/core.md` carries the operating contract.

## The goal

**Finish `.claude/specs/beta-release.md`.** The run ends when every pull request in its State section
is merged to `main` and `/android-release` has published to the open track. Not before.

There is a second spec, `.claude/specs/orbit-redesign.md`, with its own handoff. **This one wins when
the machine cannot run both.** Three concurrent workers is the ceiling; the redesign is what stops.

Re-derive what is left rather than trusting this prompt:

    gh pr list --repo thomasluizon/orbit-ui-mobile --state open --base main
    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

## In flight, with a disposition for each

**Running worker: ONE.** `#548` in `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-548-icon-suggest`,
branch `feature/ticket-548-icon-suggest`, clearing three Pullfrog findings on pull request 976.
**Outcome unknown.** Read that worktree first.

**Open pull requests, `orbit-ui-mobile`, all against `main`.** Read live 2026-09-15 at 17:48 UTC.

| pr | ticket | disposition |
|---|---|---|
| 972 | `#547` | APPROVED at `cd340c8b`, zero unresolved threads. Wait for Unit Tests, then MERGE. It is first |
| 971 | `#134` | review round pushed. Poll for the re-review, clear what it finds, merge |
| 973 | `#552` | review round pushed. Same |
| 974 | `#550` | review round pushed. Same |
| 976 | `#548` | the running worker owns it |
| 977 | `#553` | its only finding was a wrong issue link, already corrected in the body. Needs a RE-REVIEW, not a code round |
| 978 | `#554` | no review yet. Poll, clear, merge |

Four dependabot pull requests also sit on `main` and are not this effort.

**Not started:** `#551`, Cloud off by default. It needs a worktree, an install and a worker.

**Uncommitted work that belongs to this effort:** `ticket-548-icon-suggest` holds 15 dirty files,
which is the running worker mid-round.

**`orbit-api`:** 521 and 520 are still open on `main`, each with one live P1 and an order already
posted as the newest comment on its ticket. They are not part of this release and they are still
yours to merge and deploy under Thomas's standing instruction.

## What to do, in order

1. **Merge 972** once Unit Tests finish. It is approved with zero unresolved threads.
2. **Poll the re-reviews on 971, 973 and 974**, clear anything new, merge each.
3. **Request a re-review on 977** and merge it.
4. **Drive 976 to approval** when its worker exits, and **978 through its first review**.
5. **Build `#551`**, Cloud off by default.
6. **Run `/android-release` to the open track** once every pull request above is merged.
7. Tell Thomas that `#134` closes only when he opens the built app and taps the three-dot control on
   a day that already has completed habits. No device repro was possible in any session.

## When this run is allowed to end

**Only when the spec is done.** A blocker is the next piece of work, never an ending. Waiting on CI or
a review is waiting: start the next thing while it runs. A finding too large for its pull request
becomes a ticket AND you pick it up. A missing capability is built.

The only honest early ending is external: the GPT Sol allowance is exhausted, the machine stops, or
Thomas says stop. Say which one it was, and never report it as the work being finished.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop.

Three things that cost real work on 2026-09-15:

- **Do not pass `--cloud`.** Five submissions, five empty diffs.
- **`tools/list-bot-threads.mjs` refuses to run from a `redesign/main` checkout** while this effort is
  live, because it compares `.claude/orchestrator.json` against `origin/main`. Read reviews with
  `gh api graphql` or run it from a `main` worktree.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason` naming the new head and the new findings. A refused launch registers NO wake
  source.

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact.
