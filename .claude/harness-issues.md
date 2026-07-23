# Harness issues

**At a glance:** an append-only defect log for the `/drive` harness (`run.mjs`,
`check-diff-ownership.mjs`, `workorder.mjs`, `drive-queue.mjs`) and the rules around it. Each
entry records what was OBSERVED, not what was suspected, with the evidence that established
it. Nothing here is fixed; this is the work list. Add to it whenever a run surfaces something.

Opened 2026-07-23 during the first real attended `/drive` on #539 (bundle B1,
`web-route-56d279c7` / `route-streak`, PR #574).

---

## H1 - The ownership gate measures the uncommitted working tree, so an operator edit fails an honest bundle

**Severity: high.** This is the defect that cost the first real run its verdict.

`check-diff-ownership.mjs` prints its own scope as:

```
head: d405efa2cd16 (explicit --head d405efa2cd16 + uncommitted working tree)
```

So the measured diff is `base..head` **plus whatever is dirty in the tree**. During B1 the
operator edited `.claude/specs/issue-539.spec.md` (an unrelated file) while the child was
running. The gate counted it as a changed file outside `route-streak`'s boundary and exited 1.
The driver derived `status=failed`, logged `gate-contradicted`, wrote a lesson candidate, and
incremented the consecutive-failure counter.

The child had done nothing wrong. Re-run on the child's own branch with the working copy
matching the commit, the identical command exits **0**:

```
OK: every changed file is owned by this work order or structurally permitted, and no gate state moved.
```

**Why it matters beyond one bundle.** `maxConsecutiveFailures` is 3. Three such artifacts in a
row trip the circuit breaker and halt a run that had nothing wrong with it. Any background
process that touches a tracked file (a formatter, an editor autosave, a second agent) can do
this, not just a human.

**Candidate fixes.** Measure the explicit commit range only when `--head` is given
(`git diff base..head`, not `git diff base`); or detect dirty-tree contamination and report it
as an operator error distinct from a boundary escape, so the child is not blamed for it.

**Related rule gap.** The standing rule was "never local-git in a repo while a night-run runs
there." That is too narrow: no git command is required to trigger this, only a file write.
The rule should be "never write ANY tracked file in the repo while a drive child is running."

---

## H2 - A post-mortem gate re-run reports a different, misleading failure

**Severity: high (diagnosis-blocking).**

After a run, `resetReposToBase` returns the tree to base. Re-running the same gate command
then compares the base ref's copy of the work order against the **working** copy rather than
the committed one, and fails with:

```
check-diff-ownership: work order "route-streak" rewritten - Timeline is append-only.
The base ref's copy must be a byte-prefix of the committed copy and of the working copy [...]
this change is not it.
```

That message accuses the child of destroying Timeline history. It is false. The child's
committed `route-streak.md` was verified **byte-exact** against a fresh `node tools/workorder.mjs`
regeneration. The only thing wrong was that the investigator was standing on the wrong branch.

So the harness produces two different failure reasons for the same artifact depending on tree
state, and the post-mortem one actively points at the wrong culprit. Anyone diagnosing a failed
bundle without knowing to `git checkout <child-branch>` first will reach the wrong conclusion.

**Candidate fix.** When `--head` is explicit, resolve the work-order comparison from that
commit rather than the working copy, so the check is reproducible from any branch.

---

## H3 - Nothing detects the shallow sweep the work order explicitly forbids

**Severity: high.** This is the substantive one.

Every work order carrying `local/spacing-scale` debt says, in its own words:

> do not batch-snap every number to the nearest step and call it done - that is the shallow
> sweep this harness exists to stop. Decide each one against the surrounding rhythm (tight
> within a group, air between groups).

B1's child did precisely that, and said so in its summary: *"editing each literal to its
nearest DESIGN.md scale step."* The complete diff:

```
18 -> 16    14 -> 12    10 -> 8    6 -> 4    15 -> 16
```

Every value moved toward the nearest step. None was raised to create air between groups. None
was kept through the sanctioned `eslint-disable-next-line local/<rule> -- <why>` escape. And
it passed **every** machine gate: Backlog A exit 0, ownership exit 0, regeneration byte-exact,
Timeline appended, tests green.

The depth axis did catch the shallowness (**11.2% vs the 30% floor**), which is the harness
working as designed. But depth is only consulted by a human reading the line; nothing in the
child's own definition of done ever shows it a number it must beat, and nothing flags a diff
whose every edit is a nearest-step snap.

**Candidate fix.** A cheap deterministic check is available: if every changed spacing literal
moved to its nearest scale step and none moved away from it, the diff is a pure snap. That is
mechanically decidable and would let the driver mark the bundle `shallow` rather than
`ready-for-review`. It does not require judgement, only arithmetic.

---

## H4 - The work-order ledger goes stale after a merge and nothing warns before it does damage

**Severity: medium.**

Merging `main` into the feature branch (`6a2e1136`) left all 214 work orders and
`surfaces.json` still carrying `generatedFrom: 48e4496e`. A fresh `node tools/workorder.mjs`
differed on **216 files** (provenance only, no Timeline or debt movement).

Consequences if it had not been caught by hand:

- CI's ledger-freshness gate asserts committed orders are byte-equal to a fresh regeneration,
  so every bundle PR would have failed that gate.
- `drive-queue.mjs` packs bundles from the ledger, so the queue was derived from stale input.

`run.mjs --dry-run` preflight does **not** check ledger freshness. It checks a clean tree, the
base branch, prompts, and `{{DRIVE_BASE}}` pins.

**Candidate fix.** Add a preflight check that a fresh regeneration is byte-equal to the
committed ledger, failing the same way the clean-tree check does.

---

## H5 - A `failed` bundle still leaves an open PR carrying no sign that the driver failed it

**Severity: medium.**

B1 was recorded `failed`, yet `gh pr create` had already run and PR #574 sits open, ready for
review, with green CI and no marker of the driver's verdict. The independent verifier does not
run on a failed bundle (it is gated on `SUCCESS_STATUSES`), so it posts no comment either.

Anyone browsing the PR list sees a normal, healthy PR. The only record that the driver rejected
it lives in `.claude/drive/<dir>/runs/<stamp>/`, which is gitignored.

**Candidate fix.** Post the driver's derived status as a PR comment for every terminal outcome,
not only for verified successes.

---

## H6 - `run.mjs` has no single-bundle flag, and mislabels the mode when run without `--attended`

**Severity: low, but it shaped this whole session.**

`parseArgs` accepts only `--dir`, `--dry-run`, `--attended`. There is no `--only <id>`. Running
exactly one bundle therefore requires hand-building a parallel runtime dir:

```
.claude/drive/b1/{config.json, queue.json, prompts/task-<id>.md}
```

then `node .claude/skills/drive/run.mjs --dir .claude/drive/b1`. This works and keeps the
engine unmodified (base pinning, `measureChildWork` and derived status all still hold), and
placing it under the gitignored `.claude/drive/` keeps it out of the tree. But it is
undocumented as the single-bundle path and is easy to get wrong.

Separately, a run without `--attended` logs `drive --sleep starting` even when a human is
driving it bundle by bundle. The log then reads as an unattended overnight run that nobody
launched.

**Candidate fix.** Add `--only <id>` (filter the queue in memory), and derive the mode label
from whether gates are actually active rather than from the absence of `--attended`.

---

## H7 - `resetReposToBase` silently absorbs operator work into a stash

**Severity: low (recoverable, but quiet).**

When the tree is dirty the driver runs `git stash push -u` and continues. The only notice is
one line in `run.log`:

```
stashed leftover changes from [web-route-56d279c7] in . -> 8c30de0ab00c (git stash list)
```

The work is recoverable (`git stash pop`), and in this session it was. But an operator not
reading the run log will find their edits gone with no other signal, and the stash is created
on whatever branch the child left checked out, not on the base.

---

## H8 - The spec's `next-action` had been stale for a full working session

**Severity: low, process not code.**

`.claude/specs/issue-539.spec.md` still instructed the reader to *"FINISH THE IN-PROGRESS
MERGE of main into this branch (staged, uncommitted)"* long after that merge was committed as
`6a2e1136`. It also listed two test failures as "known and NOT yet fixed" that both pass
(`habit-row` 10/10, `calendar-views` 6/6; full suite 313 files / 2605 tests, exit 0).

The `/drive` skill does say to reconcile the spec against `gh` on every resume, so the process
exists. But nothing enforces it, and a resumable-state artifact that lies is worse than none:
its whole value is that a fresh session can trust it.

**Adjacent trap worth recording:** `apps/mobile` runs **Vitest**, not Jest. Invoking `npx jest`
there produces a "Vitest cannot be imported in a CommonJS module" error that reads exactly like
a real regression and is not one. Two of this session's early "confirmations" of the stale
failures were this mistake.

---

## H9 - Orca orchestration has no human-facing UI, so gates cannot be approved from the app or phone

**Severity: informational, but it invalidates a plausible workflow design.**

`/drive` gates were going to be surfaced as Orca decision gates so they could be approved from
the Orca app. They cannot be. Established three ways:

1. The running app's accessibility tree carries no gate, inbox, message or decision surface.
2. The app's "Tasks" panel is a GitHub/Jira issue browser (Issues / PRs / Projects, "Search
   GitHub issues"), not the orchestration task list.
3. The published docs describe orchestration as CLI/RPC only; task ids render as clickable
   links that focus a terminal, and there is no panel for viewing or resolving a pending gate.

Orchestration messages are delivered to a **terminal**, and are rendered only when that
terminal's agent runs `orchestration check --inject`. A `--to @all` broadcast therefore reaches
other agent sessions, never the human.

**Consequence.** Drive gates stay in the terminal. Orca tasks and gates are still worth
creating as durable provenance (they outlive the session and are queryable), but they are a
record, not an interaction surface.
