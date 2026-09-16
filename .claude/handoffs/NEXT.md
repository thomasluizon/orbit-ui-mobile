# Continue the Orbit redesign

One effort is live now. The beta release finished and shipped; its spec is a record, not a queue.

Read these before anything else, in this order:

1. `.claude/specs/orbit-redesign.md`, the screen-by-screen rebuild on `redesign/main`. This is the
   work.
2. `.claude/specs/beta-release.md`, which is DONE. Read it once for its constraints section: the
   things it learned about `strict: true`, `pullfrog-approval`, killed workers and red checks that
   name no defect all still bite on this branch.

Each spec carries its own standing instructions, decisions, constraints and state. This prompt only
says what to do next.

**Every identifier below came from a previous session. Treat each as a lead to verify, not a fact.**

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` registers one.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included, with one correction
below.

## The goal

**Finish `orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. That command is
necessary and NOT sufficient: it validates the MAPPING, never whether a surface satisfies its
ticket, and it reads a manifest no CI job regenerates. Judge every ticket against its own acceptance
criteria, in the tree, before closing it.

Re-derive what is left rather than trusting this prompt:

    gh pr list --repo thomasluizon/orbit-ui-mobile --state open
    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 300

129 carried `repo:ui` at 01:30 UTC on 2026-09-16. All eleven screen tickets are open: `#53`, `#56`,
`#57`, `#58`, `#63`, `#67`, `#71`, `#73`, `#74`, `#76`, `#329`.

## Do this first, before any screen work

**1. Land 979, the drift merge, ticket `#556`.** A worker was mid-merge when this handoff was
written, in `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-556-drift-merge` on branch
`chore/ticket-556-drift-merge`. **Outcome unknown. Read that worktree first**: 161 files were dirty
with a merge in progress and one commit unpushed.

It matters more than its size. `redesign/main` does not contain `main`, and that makes every
orchestrator tool refuse from a `redesign/main` checkout, `launch-worker.mjs` included, with:

    .claude/orchestrator.json disagrees with origin/main and this checkout does not contain
    origin/main, so the working copy may be the stale one.

**2. Then put the orchestrating checkout back on `redesign/main`.** It is currently on `main`. That
was the only way to launch workers at all while the release was running, and it costs you the
`progress`, `questions`, `drift-review` and `sleep` skills, which exist only on `redesign/main`. It
also means the on-disk `CLAUDE.md` and `.claude/rules/core.md` are `main`'s stale copies right now.

    git checkout redesign/main

Verify afterwards that `node tools/launch-worker.mjs --help` runs without the staleness refusal, and
that `/progress` appears in your skill list.

**3. Check the release landed.** It was dispatched at 01:20 UTC and was still building:

    gh run view 35044341064 --repo thomasluizon/orbit-ui-mobile

If it failed, that is the next work, ahead of the redesign. If it succeeded, Orbit **1.3.28 (87)** is
on the Play open track from `main` at `adc070bc`.

## Then the redesign, in this order

1. **963**, Wrapped stage 7, head `8d69cb53`. Two live P1s, both verified against the tree, neither
   fixed: `packages/shared/src/utils/share-card.ts:71` accepts `"0000"` as a year while
   `orbit-api`'s `ClosedMonthPeriodRange.cs:13` rejects anything below 1, so that deep link always
   400s; and `apps/mobile/hooks/use-push-notifications.ts:557` routes Expo's cached launch response
   without clearing it, so an error-boundary retry replays it. A round 2 order is the newest comment
   on `#63`.
2. **`#545`**, the largest suppression drop available. Stage 1 is COMMITTED as `49a913bb` in
   `ticket-545-form-fields`, 14 files, 63 suppressions dropped from `apps/web/eslint-suppressions.json`,
   seven commits unpushed. It needs a merge-forward and a push, NOT a rewrite. A delivery-only order
   is the newest comment on `#545`.
3. **`#67` stage 1**, 132 files staged and uncommitted in `ticket-67-onboarding-s1`. Round 2 order is
   the newest comment on `#67`. Drive it; do not reset it.
4. **970**, `/progress` generic plus `--full`. DIRTY, two findings, no round run.
5. **`orbit-api` 521 and 520.** One live finding each, everything else green, a fresh order naming the
   exact finding on `#526` and `#229`. Yours to merge and deploy under his standing instruction.
6. **`#557`**, filed this session: Android offers Log in while the session is still recoverable.
7. Then `#76` stage 9, `#56` stage 13, `#71` stage 10, `#73` stage 3, `#53`, `#74`, `#543`, `#544`,
   and the six Progresso sweeps `#472`, `#473`, `#476`, `#477`, `#478`, `#480`.

**`#546` stays untouched.** D95 forbids the run judged by `Guards` from fixing the Gate Charter.

## Four things that cost real work, and one that is new

- **The local worker cap is TWO.** Four were killed at once for low memory. D89 says three; two is
  what this machine holds. Every killed worker had COMMITTED first, so read the worktree before
  assuming loss, and prefer a delivery-only relaunch on `--tier mechanical`.
- **Do not pass `--cloud`.** `#551` landed as 980 and Cloud now refuses by default, correctly.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason` naming the new head and the new findings. A refused launch registers NO wake
  source, which is how a turn ends with none.
- **Ask for a forced `--re-review` on any head that matters.** Four times in one night it found a new
  P1 behind a green approval, including a bulk delete that could reach habits the screen was hiding.
- **NEW: never `git worktree remove --force` on Windows.** It follows a junction and deletes the
  target's contents. `rmdir` the junctions first, then remove without `--force`.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop.

**Do not ask him to confirm work he has already asked for in writing.** He said so on 2026-09-16
after a release was held for a second yes: "you shouldnt have asked me to say 'go', you could've just
shipped it." A written instruction IS the authorisation.
