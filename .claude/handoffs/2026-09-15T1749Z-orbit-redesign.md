Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` registers one.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. Not before.

**The coverage command is necessary and NOT sufficient.** It validates the MAPPING, never whether a
surface satisfies its ticket, and it reads a committed manifest no CI job regenerates. Judge every
ticket against its own acceptance criteria, in the tree, before you close it.

**A second effort runs beside this one and outranks it**: `.claude/specs/beta-release.md`, the fixes
shipping to the Play open track off `main`, with its own handoff. Three concurrent workers is the
ceiling on this machine, and **this effort is what stops** when both want the slots. Thomas asked for
exactly that on 2026-09-15.

Re-derive what is left rather than trusting this prompt:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

133 carry `repo:ui`. Eleven are screens: `#53`, `#56`, `#57`, `#58`, `#63`, `#67`, `#71`, `#73`,
`#74`, `#76`, `#329`.

## The largest remaining block is still the suppressed lint violations

367 across both platforms, and the important finding of 2026-09-15 is that **196 of them belong to
surfaces whose screen ticket is already CLOSED**, so no open ticket reaches them. That is ticket
`#545`, five stages, file-by-file with per-rule counts. Its stage 1 worker was stopped for machine
load with no commits and 13 files dirty in
`C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-545-form-fields`. Dependencies are installed
there.

## In flight, with a disposition for each

**Running workers for this effort: NONE.** The `#545` stage 1 worker was stopped deliberately.

**Open pull requests, all against `redesign/main`.** Read live 2026-09-15 at 17:49 UTC.

| pr | head | disposition |
|---|---|---|
| 969 | `9dc11daf` | About stages 6 to 8. APPROVED after the round-4 fix. Confirm at the exact head, then MERGE |
| 963 | `8d69cb53` | Wrapped stage 7. APPROVED, merge-forward landed. Needs a re-review at that head, then merge |
| 959 | `061dddb7` | Progresso stage 5b. APPROVED, merge-forward landed, review-harness block written by hand. Poll, merge |
| 970 | `e15d5228` | `/progress` generic plus `--full`. Two real findings, no round run yet. Order a round |

**New tickets filed 2026-09-15 that belong to this effort:**

- **`#545`** the 196 orphaned suppressions, five stages. Stage 1 is ready to relaunch.
- **`#549`** a day older than seven days switches off every habit action, not just logging. Thomas
  approved the rule; the ticket carries it.
- **`#546`** `Gate Charter` never installs `js-yaml`, so it has never executed. **D95 forbids a run
  fixing the gate it is judged by**, and every pull request here is judged by `Guards`. Leave it
  filed unless you are certain D95 does not bind you.

**Uncommitted work that matters:** `ticket-67-onboarding-s1` holds 132 staged files, +133 and
-10,822, from a Cloud task: the tour, the push prompt and the template pack step deleted on both
platforms. It cannot be committed as it stands, because the root type-check fails with five `TS2554`s
and the surface manifest is untouched. The round 2 order is the newest comment on `#67`. **Drive it;
do not reset it.**

Every other dirty worktree, stash and detached HEAD is old debt and blocks nothing. The spec's State
section lists them.

## What to do, in order

1. **Merge 969, 963 and 959** once each is confirmed at its exact current head.
2. **Order a round on 970** for its two findings.
3. **Relaunch `#545` stage 1** in its existing worktree.
4. **Commit `#67` stage 1** through its round 2 order. It is the single largest suppression drop
   available, web 180 to 142 and mobile 187 to 150.
5. **Then `#549`, `#76` stage 9, `#56` stage 13, `#71` stage 10, `#73` stage 3, `#53`, `#67` stages 2
   to 9, the six Progresso sweeps, `#74`, and `#545` stages 2 to 5.**
6. **Judge and close every screen ticket against its own criteria**, then run
   `node tools/redesign-coverage.mjs` and close the effort against what it reports.

## When this run is allowed to end

**Only when the spec is done.** A blocker is the next piece of work, never an ending. The only honest
early ending is external: the allowance is exhausted, the machine stops, or Thomas says stop.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping.

Three things that cost real work on 2026-09-15:

- **Do not pass `--cloud`.** Five submissions, five empty diffs. `#551` turns it off by default.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason`. A refused launch registers NO wake source.
- **A merge-forward and any order that reads another branch must run LOCAL**, and a merge-forward
  order forbids fixing anything it finds.

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact.
