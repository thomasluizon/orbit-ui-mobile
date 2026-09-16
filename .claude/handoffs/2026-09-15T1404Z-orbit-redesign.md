Read `.claude/specs/orbit-redesign.md` first. It carries the standing instructions, the decisions,
the constraints and the state. This prompt only says what to do next.

## Your entry point

Read and execute `.claude/skills/sleep/SKILL.md`. It runs the work through `/orchestrate` itself, so
do not invoke `/orchestrate` separately. Before your first turn ends, write run state with YOUR
session id and `sleep: true`, read it back, and confirm. End every turn with a live wake source,
named on the turn's last line. Only `launch-worker.mjs` and `submit-cloud-worker.mjs --watch`
register one.

`.claude/rules/core.md` carries the operating contract, D89 and D90 included.

## The goal

**Finish `.claude/specs/orbit-redesign.md`.** The run ends when every screen ticket is closed and
`node tools/redesign-coverage.mjs` reports a valid mapping with nothing missing. Not before.

**The coverage command is necessary and NOT sufficient**, and this is the single most expensive thing
the last run learned. It validates the MAPPING, never whether a surface satisfies its ticket, and it
reads a committed manifest that no CI job regenerates. Three tickets called finished were not:
judge every ticket against its own acceptance criteria, in the tree, before you close it.

Re-derive what is left rather than trusting this prompt:

    gh issue list --repo thomasluizon/orbit-tickets --state open --label "repo:ui" --limit 200

123 carry `repo:ui`. Eleven are screens: `#53`, `#56`, `#57`, `#58`, `#63`, `#67`, `#71`, `#73`,
`#74`, `#76`, `#329`.

## The largest remaining block is the suppressed lint violations

180 across 54 files on web and 187 across 45 on mobile, read on `52ec075e`. Thomas named these
explicitly on 2026-09-15. Every screen ticket already demands its own share gone with a strict
Suppressions Ratchet decrease, so no ticket closes without it. The spec's own section carries the
per-rule breakdown and the two rules for doing it.

## In flight, with a disposition for each

**Running worker: ONE.** `#329` in `C:/Users/thoma/orca/workspaces/orbit-ui-mobile/ticket-329-progresso-s5b`,
branch `feature/ticket-329-progresso-s5b`, log
`C:\Users\thoma\AppData\Local\Temp\orbit-workers\#329-1789480646500.log`. Sent to merge
`origin/redesign/main` forward into 959 and nothing else. **Outcome unknown.** Read that worktree
first: its own diff must come back as exactly 5 files, +18 and -12.

**Open pull requests, `orbit-ui-mobile`.** Read live 2026-09-15 at 14:04 UTC.

| PR | base | head | disposition |
|---|---|---|---|
| 970 | `redesign/main` | `e15d5228` | `/progress` generic plus `--full`, what Thomas asked for. No review yet. Poll, then merge |
| 969 | `redesign/main` | `6f4a669e` | About s6-8 round 3 pushed. Poll the review, clear what it finds, merge |
| 962 | `redesign/main` | `10d02060` | APPROVED, merge-forward already done. Needs a review of the NEW head, then merge |
| 963 | 962's branch | `b34c0d88` | APPROVED, CONFLICTING. Retarget to `redesign/main` BEFORE 962 merges, then merge-forward |
| 959 | `redesign/main` | `4557939f` | APPROVED, CONFLICTING. The running worker owns it |

Four dependabot pull requests sit on UI `main` and are not this effort.

**Open pull requests, `orbit-api`.** Both are real work, both target `main`, and Thomas's standing
instruction says you merge and deploy them yourself. Each has ONE live P1 and an order already posted
as the newest comment on its ticket: **521** (`cc86c612`, `#526`) and **520** (`ce610484`, `#229`).
Three dependabot ones sit beside them. No dirty worktree, no stash.

**Uncommitted work that matters, exactly one item.** `ticket-67-onboarding-s1` holds 132 staged files,
+133 and -10,822, from a Cloud task: the tour, the push prompt and the template pack step deleted on
both platforms. It cannot be committed as it stands, because the root type-check fails with five
`TS2554`s and the surface manifest is untouched. The round 2 order is the newest comment on `#67` and
dependencies are installed in that worktree. **Drive it; do not reset it.**

**Branches pushed with no pull request:** `feature/ticket-67-onboarding-s1`, the staged work above, and
`feature/ticket-76-widget-s9`, pushed at `e2f34493` with no work on it yet. `feature/ticket-329-progresso-s7b`
and `feature/ticket-63-wrapped-s5` are merged and undeleted. Six older ones block nothing.

**Every other dirty worktree, stash and detached HEAD is old debt and blocks nothing.** The spec's
State section lists them, including the two that look like lost commits and are not.

**Cloud is UNAVAILABLE to a session that opens the breaker.** It opened on 2026-09-15 after `#76`
stage 9 returned an empty diff twice. A NEW session starts with it closed, so Cloud is available to
you, but a container's `testResults` is a claim: re-run every check locally.

**Ignored paths.** The previous session's scratchpad holds `sleep-decisions.md`, 46 logged decisions.
Every durable fact is now in the spec. It dies with that session.

## What to do, in order

1. **Read the running worker's worktree** and finish 959.
2. **Merge what is clean**: 970 and 962 first, each needing only a review of its current head.
3. **Clear 969's review** and merge it, then retarget and merge-forward 963.
4. **Commit `#67` stage 1** through its round 2 order. It is the single largest suppression drop
   available, web 180 to 142 and mobile 187 to 150.
5. **Merge the two `orbit-api` pull requests**, whose orders are already written.
6. **Then the suppression sweeps and the unstarted screens**: `#76` stage 9, `#56` stage 13, `#71`
   stage 10, `#73` stage 3, `#53`, `#67` stages 2 to 9, the six Progresso sweeps, `#74`.
7. **Judge and close every screen ticket against its own criteria**, then run
   `node tools/redesign-coverage.mjs` and close the effort against what it reports.

## When this run is allowed to end

**Only when the spec is done.** A blocker is the next piece of work, never an ending. Waiting on CI or
a review is waiting: start the next thing while it runs. A stacked child is not blocked; its parent is
the work. A finding too large for its pull request becomes a ticket AND you pick it up. A missing
capability is built.

The only honest early ending is external: the GPT Sol allowance is exhausted, the machine stops, or
Thomas says stop. Say which one it was, and never report it as the work being finished.

## --sleep

This run continues unattended. Take every decision yourself, always the best approach and never the
easiest, write each one to a decision log in your own scratchpad as it is made, and keep shipping
until he says stop.

**His words on 2026-09-15: "the lint violations fixes, and the redesign finished, as fast as
possible."** "As fast as possible" narrows HOW, never WHAT. It means never leave the single local
worker slot idle, never open a front that closes no ticket, and prefer the item that unblocks the most
work next. It does not license a cheaper implementation and it never overrides "always the best
implementation".

Five things that cost real work on 2026-09-15 and are easy to repeat:

- **Run one local worker at a time**, and poll reviews inline rather than holding background waiters.
- **`caps.workerLaunchesPerBranch` is 2 and it WILL refuse a legitimate review-fix round.** Pass
  `--relaunch-reason` naming the new head and the new findings. A refused launch registers NO wake
  source, which is how a turn ended with none.
- **A merge-forward and any order that reads another branch must run LOCAL.**
- **Run `npm run type-check` from the repository ROOT after every round, and install dependencies in
  the ORCHESTRATING checkout too.** A stale install there made two type errors appear that did not
  exist.
- **Editing any calibrated file fails `Harness Calibration`** until
  `node tools/reseed-calibration.mjs` runs and its verdict is reconsidered. After any `.claude/**` or
  `tools/**` change, run `node tools/test-tools.mjs` AND `node .claude/hooks/test-hooks.mjs`.

Every identifier here came from a previous session. Treat each as a lead to verify, not a fact. All of
it was read live on 2026-09-15 at 14:04 UTC.
