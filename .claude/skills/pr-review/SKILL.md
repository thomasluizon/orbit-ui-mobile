---
name: pr-review
description: Deep code review of a diff across both Orbit repos against one shared rubric, orchestrating the five review subagents and a backward-compat guard. Use when the user asks to review a PR, file, folder, or staged changes in orbit-ui-mobile or orbit-api. Replaces /review and /security-review.
argument-hint: <pr-number | api#N | pr-url | file | folder | blank=staged>
context: fork
---

# PR Review

**Input**: $ARGUMENTS

Review a diff end-to-end against `rubric.md`, fold in the five review subagents, guard
against changes that break already-shipped mobile clients, and produce one
severity-ranked report — posted to the PR when the scope is a PR.

**Golden rule**: every finding is constructive and actionable — a clear fix, a file:line,
and the rule it traces to. Severity is about blast radius, not which dimension raised it.

---

## Phase 0 — Provenance & self-containment

The review dimensions in `rubric.md` were adapted at authoring time from the
**code-review base on claudeskills.info** (https://claudeskills.info), then specialized to
Orbit's own standards (the ten Code Standards in root `CLAUDE.md`, the orbit-api hard
rules, `eslint-rules/no-comments.cjs`, `DESIGN.md`, and the security categories). The
adapted result is committed in-repo at `rubric.md`, so a run reads only local repo files
and `gh` / `git` against the project's own remotes: no network call, no runtime
marketplace dependency. That URL is the single WHY-with-URL note the standard allows.

---

## Phase 1 — Resolve scope

Parse `$ARGUMENTS` into a review target and detect which repos it touches.

| Input | Repo | Example | Action |
|---|---|---|---|
| Number `123` | ui-mobile (default) | `#123` | `gh pr view 123 --repo thomasluizon/orbit-ui-mobile` |
| `api#123` or `orbit-api#123` | api | `api#42` | `gh pr view 42 --repo thomasluizon/orbit-api` |
| Full PR URL | parsed from URL | `https://github.com/thomasluizon/orbit-api/pull/9` | use the URL's repo |
| File path | local repo | `apps/web/hooks/use-x.ts` | review that single file |
| Folder path | local repo | `apps/mobile/components/` | review every source file under it |
| Blank | local | (none) | review staged changes; if none staged, review unstaged |

**For a PR:**

```bash
gh pr view {N} --repo {OWNER/REPO} --json number,title,body,author,baseRefName,headRefName,files,labels
gh pr diff {N} --repo {OWNER/REPO}
```

**For a file / folder:** use Glob with `**/*.{ts,tsx,cs}` scoped to the target path.

**For blank:**

```bash
git diff --cached --name-only
git diff --cached
```

(If nothing is staged, fall back to `git diff`.)

Then classify the diff: **frontend** (`apps/`, `packages/`), **backend**
(`orbit-api/src/`), or **both**. The classification drives which dimensions are gated in
and which subagents fire in Phase 4.

---

## Phase 2 — Load context

In parallel:

- `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile\CLAUDE.md` (root + the
  scoped workspace `CLAUDE.md` for any touched workspace).
- `C:\Users\thoma\Documents\Programming\Projects\orbit-api\CLAUDE.md` (root + scoped
  project `CLAUDE.md`) — only if the diff touches backend.
- `DESIGN.md` — only if the diff touches `apps/*` UI files.
- `TESTING.md` - the suite catalog and test-writing conventions; consult it for suite semantics when the diff touches tests.
- The plan in `.claude/plans/completed/` if the PR body references one.
- **`.claude/skills/pr-review/rubric.md`** — the dimensions, severities, and finding
  template this review walks.
- **`.claude/skills/_shared/verification-protocol.md`** — the shared reliability contract;
  its Verify phase and Deferred ledger run below.

Understand intent: for a PR read the title, body, and linked issue; for a file
understand its role; for staged changes, what is in flight.

---

## Phase 3 — Walk the rubric

Go dimension-by-dimension through `rubric.md` against the diff. For each, emit findings
in the rubric's finding template, tagged with a severity from the ladder. Honor the
gates: skip a dimension whose surface the diff never touches (mark N/A — do not invent
findings), and only run the UI dimension (DESIGN.md / AI-slop, #8) when `apps/*` UI
files changed, the backend hard rules (#13) only when `orbit-api` changed, and
FEATURES.md parity (#14) only when the diff changes the user-facing feature surface.

The dimensions, in order: Correctness · Dead/stale code · SOLID/clean-arch · Comment
policy · No-workaround · Type safety · No `console.log` · DESIGN.md/AI-slop ·
Parity · i18n · Contract drift + backward-compat · Security · Backend hard rules ·
FEATURES.md parity.

Focus on changed code, not pre-existing issues — unless a pre-existing issue is Critical.

**Coverage contract (verification protocol §1):** the diff's changed files are the binding
inventory, ranked worst-first (trust-boundary and contract surfaces, then blast-radius x
churn, then stable leaves). Every changed file ends with a verdict or in the Deferred
ledger.

Apply the rubric's **Signal gate** as written there: it fixes what gets posted and the
deterministic outcome (**NEEDS WORK** iff any Critical/High finding survives, otherwise
**APPROVE**).

---

## Phase 4 — Orchestrate subagents

Delegate the five specialist subagents, gated by what the diff touches, **3 concurrent
at a time** (the root CLAUDE.md delegation cap). Pass each the list of changed files. Fold
every result back into the Phase 3 findings under the matching rubric dimension.

**Block on them within this same turn.** Spawn the gated subagents, wait for every one to
return, and fold its result in before moving to Phase 5. The CI wrapper
(`.github/workflows/claude-review.yml`) runs a single execution with **no**
background-completion wake-up, so a subagent still running when the turn ends strands the
review half-done and posts nothing. If you cannot block on one, run its check inline
yourself.

| Subagent | Gate (fire when…) | Folds into rubric dimension |
|---|---|---|
| `parity-checker` | any `apps/web/**` or `apps/mobile/**` file changed | Parity (#9) |
| `i18n-syncer` | user-facing strings or `packages/shared/src/i18n/*.json` changed | i18n (#10) |
| `contract-aligner` | **both** repos changed, or `packages/shared/src/types/*` / `endpoints.ts` changed | Contract drift (#11) |
| `security-reviewer` | `orbit-api` code changed | Security (#12, API side) |
| `design-reviewer` | any `apps/web/**`, `apps/mobile/**`, or `orbit-landing-page/src/**` UI file changed | DESIGN.md / AI-slop (#8) |

`security-reviewer` covers orbit-api security; the rubric's frontend-security checks (XSS,
auth-state leakage) cover what that agent explicitly does not.

---

## Phase 5 — Backward-compat guard

Answer one question: **does this diff rename or remove a field that an already-shipped
(old) mobile client still sends or reads?** This leans on `contract-aligner`'s field
comparison from Phase 4 and adds the direction + add/remove judgment that drift detection
alone does not make.

1. From the diff, isolate hunks in `packages/shared/src/types/*.ts` (Zod
   `z.object({...})` schemas) and in `orbit-api/**/DTOs/*.cs` (records / classes).
2. A **removed line** declaring a field (`fieldName: z.…` removed with no matching add),
   OR a **renamed field** (one field removed + one added in the same schema, types
   compatible), is a candidate.
3. Classify and tag each candidate by `rubric.md` dimension 11, which carries the whole
   table (response vs request direction, removed/renamed vs added-optional vs
   newly-required vs enum-value-removed), the compatible-alternative fix, and the
   downgrade-to-High rule when old-client reach is uncertain.

Scope is **field add/remove/rename in the reviewed diff**. Semantic/behavioral breaks
under an unchanged field name are caught by Correctness (#1) and the human reviewer — do
not over-claim completeness here.

---

## Phase 6 — Verify findings (adversarial)

Run `.claude/skills/_shared/verification-protocol.md` before validating — every finding
that will decide the outcome has to survive a challenge first.

1. **Adversarial pass (§2).** Spawn a skeptic per **Critical / High** finding (including
   any `⚠️ breaks old mobile clients`) exactly as the protocol specifies, adding the
   diff-specific refutation angle: is the field actually still present, or
   optional-and-unused with the grep to prove it? The survivors decide the recommendation.
2. **Cross-model second opinion (§2, Critical survivors, interactive only).** For each
   **Critical** finding that survives step 1 (including any `⚠️ breaks old mobile clients`),
   fire **`/second-opinion`**: pipe the finding dossier (title · severity ·
   `repo/path:line` · the claimed defect · the cited code hunk) to
   `node .claude/skills/second-opinion/second-opinion.mjs` and apply the verdict table that
   skill carries. Two bindings are this skill's own: a **DISAGREE** finding is tagged
   **`CONTESTED`**, records GLM's `reasoning` beside Claude's, and stays Critical for the
   human to resolve; **UNAVAILABLE** (opencode is absent on every CI runner, and when
   capped or offline) leaves the finding exactly as step 1 left it, stated in one line.
   Scope to **Critical only**, never High: cross-model time and cost is reserved for the
   findings that actually block. CONTESTED never changes the deterministic recommendation,
   so a surviving Critical still means NEEDS WORK.
3. **Completeness pass (§3).** One pass only — a diff is its own boundary, so no loop: ask
   *"what changed file or hunk did I not give a verdict, what dimension did I mark N/A
   without checking its surface?"* and close the gap before reporting.
4. **Deferred ledger (§4).** Every dimension marked N/A and every changed file not
   verdicted goes into the report's **Deferred** line with a one-line reason — so "clean"
   never hides "not looked at."

---

## Phase 7 — Validate

Run the affected-repo checks by **delegating to the `/validate` skill** (auto-detects
frontend / backend / both) rather than hardcoding a second copy of the command set —
one source of truth for how Orbit validates. Skip the repo the diff never touched.
Record each result as PASS / FAIL with the error summary for the report's validation
table. For a file/folder scope with no working-tree changes, validation is N/A.

---

## Phase 8 — Report

Write the report, then post it to the PR when the scope is a PR.

```bash
mkdir -p .claude/reviews
```

**Output path**: `.claude/reviews/{scope-name}-review.md`

```markdown
# Code Review: {SCOPE}

**Scope**: {PR #N in repo / file / folder / staged}
**Recommendation**: APPROVE / NEEDS WORK

## Summary

{2-3 sentences: what was reviewed and the overall assessment.}

## Findings

### Critical
{findings in the rubric template, or "None" — `⚠️ breaks old mobile clients` findings sort here first.
A finding a cross-model second opinion disputed carries a **`CONTESTED`** tag with both
verdicts inline — e.g. "Claude: Critical · GLM-5.2: DISAGREE — {GLM's reasoning}" — so the
human sees the disagreement. It stays Critical; the tag never downgrades it.}

### High
{… or "None"}

### Medium
{… or "None"}

### Low / Info
{… or "None"}

## Subagents

| Agent | Verdict |
|---|---|
| parity-checker | PAIRED / PARTIAL / MISSING / N/A |
| i18n-syncer | IN SYNC / DRIFT / N/A |
| contract-aligner | MATCH / DRIFT / N/A |
| security-reviewer | PASS / FAIL / N/A |
| design-reviewer | PASS / ISSUES / N/A |

## Validation

| Check | Result |
|---|---|
| Lint | PASS / FAIL / N/A |
| Type check | PASS / FAIL / N/A |
| Tests | PASS / FAIL / N/A |
| Build (api) | PASS / FAIL / N/A |

## Deferred — N/A dimensions & files not verdicted

{Per the verification protocol §4: each dimension marked N/A (with why its surface wasn't
touched) and any changed file not given a verdict — one line each. "Nothing deferred" if
every dimension and file got a verdict.}

## What's good

{positive observations}

## Recommendation

{what needs to happen next}
```

### Post to GitHub (PR scope only)

The review is **decisive** — it ends as APPROVE or REQUEST_CHANGES, never a bare comment.
Map the deterministic recommendation (NEEDS WORK iff any Critical/High finding):

```bash
# NEEDS WORK — any Critical/High (incl. ⚠️ old-client break)
gh pr review {N} --repo {OWNER/REPO} --request-changes --body-file .claude/reviews/{scope-name}-review.md
# APPROVE — no Critical/High
gh pr review {N} --repo {OWNER/REPO} --approve --body-file .claude/reviews/{scope-name}-review.md
```

Inline comments (Critical/High, tied to a specific line) via the PR review-comments
endpoint / `mcp__github_inline_comment__create_inline_comment`.

**Caller context decides who posts:**

- **CI wrapper** (`.github/workflows/claude-review.yml`) invokes this skill: it owns the
  single decisive post — produce the report + recommendation and let it submit (skip this
  posting step). In CI also skip Phase 7 (Validate), and mark any dimension that needs the
  un-checked-out sibling repo as "not verifiable in CI".
- **Local, a PR you do NOT own**: post the decisive review yourself per the recommendation.
- **Local, your OWN PR** (GitHub blocks self-approval): write the report and post it with
  `--comment` instead — do not fail trying to `--approve`.
- **Local file / folder / staged** scope: only write the report file, never post.

---

## Output

```markdown
## Review Complete

**Scope**: {what was reviewed}
**Recommendation**: APPROVE / NEEDS WORK

| Severity | Count |
|---|---|
| Critical (incl. ⚠️ old-client breaks) | {N} |
| High | {N} |
| Medium | {N} |
| Low / Info | {N} |

**Report**: `.claude/reviews/{scope-name}-review.md`
{Posted to PR #N — only if scope was a PR}
```
