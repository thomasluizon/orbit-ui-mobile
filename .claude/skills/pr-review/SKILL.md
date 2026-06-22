---
name: pr-review
description: Deep code review of a diff across both Orbit repos against one shared rubric, orchestrating the four review subagents and a backward-compat guard. Use when the user asks to review a PR, file, folder, or staged changes in orbit-ui-mobile or orbit-api. Replaces /review and /security-review.
argument-hint: <pr-number | api#N | pr-url | file | folder | blank=staged>
context: fork
---

# PR Review

**Input**: $ARGUMENTS

Review a diff end-to-end against `rubric.md`, fold in the four review subagents, guard
against changes that break already-shipped mobile clients, and produce one
severity-ranked report — posted to the PR when the scope is a PR.

This skill subsumes the old `/review` and `/security-review` commands: it does
everything both did and adds the backward-compat guard and a single shared rubric.

**Golden rule**: every finding is constructive and actionable — a clear fix, a file:line,
and the rule it traces to. Severity is about blast radius, not which dimension raised it.

---

## Phase 0 — Provenance & self-containment

The review dimensions in `rubric.md` were adapted at authoring time from the
**code-review base on claudeskills.info** (https://claudeskills.info — the "code-review"
/ reviewing-AI-code base), then specialized to Orbit's own standards (the ten Code
Standards in root `CLAUDE.md`, the orbit-api hard rules, `eslint-rules/no-comments.cjs`,
`DESIGN.md`, and the folded-in `/security-review` categories), which are richer than any
generic base. The adapted result is committed in-repo at `rubric.md`.

This skill is **self-contained**: it makes **no network call at run time** and has no
runtime marketplace dependency. It reads only local repo files and runs `gh` / `git`
against the project's own remotes. The provenance above is the single WHY-with-URL note
the standard allows; nothing here is fetched live.

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
- The plan in `.claude/plans/completed/` if the PR body references one.
- **`.claude/skills/pr-review/rubric.md`** — the dimensions, severities, and finding
  template this review walks.

Understand intent: for a PR read the title, body, and linked issue; for a file
understand its role; for staged changes, what is in flight.

---

## Phase 3 — Walk the rubric

Go dimension-by-dimension through `rubric.md` against the diff. For each, emit findings
in the rubric's finding template, tagged with a severity from the ladder. Honor the
gates: skip a dimension whose surface the diff never touches (mark N/A — do not invent
findings), and only run the UI dimension (DESIGN.md / AI-slop, #8) when `apps/*` UI
files changed, the backend hard rules (#13) only when `orbit-api` changed.

The dimensions, in order: Correctness · Dead/stale code · SOLID/clean-arch · Comment
policy · No-workaround · Type safety · No `console.log` · DESIGN.md/AI-slop ·
Parity · i18n · Contract drift + backward-compat · Security · Backend hard rules.

Focus on changed code, not pre-existing issues — unless a pre-existing issue is Critical.

Apply the rubric's **Signal gate**: post Critical/High and concretely-actionable Medium only — drop Low/Info nits and style preferences (manufacturing nits to avoid approving is a defect). The outcome is deterministic: **NEEDS WORK** iff any Critical/High finding survives, otherwise **APPROVE**.

---

## Phase 4 — Orchestrate subagents

Delegate the four specialist subagents, gated by what the diff touches, **3 concurrent
at a time** (mirrors `/implement` Phase 4 and the root CLAUDE.md delegation cap). Pass
each the list of changed files. Fold every result back into the Phase 3 findings under
the matching rubric dimension.

| Subagent | Gate (fire when…) | Folds into rubric dimension |
|---|---|---|
| `parity-checker` | any `apps/web/**` or `apps/mobile/**` file changed | Parity (#9) |
| `i18n-syncer` | user-facing strings or `packages/shared/src/i18n/*.json` changed | i18n (#10) |
| `contract-aligner` | **both** repos changed, or `packages/shared/src/types/*` / `endpoints.ts` changed | Contract drift (#11) |
| `security-reviewer` | `orbit-api` code changed | Security (#12, API side) |

The four are independent — launch them together (respecting the 3-cap; queue the fourth
behind the first three). `security-reviewer` covers orbit-api security; the rubric's
frontend-security checks (XSS, auth-state leakage) cover what that agent explicitly does
not.

---

## Phase 5 — Backward-compat guard

Answer one question: **does this diff rename or remove a field that an already-shipped
(old) mobile client still sends or reads?** Old Android builds run a frozen
`@orbit/shared` snapshot, so a server/shared rename is invisible to them — they keep the
old name and silently break. This leans on `contract-aligner`'s field comparison from
Phase 4 and adds the direction + add/remove judgment.

1. From the diff, isolate hunks in `packages/shared/src/types/*.ts` (Zod
   `z.object({...})` schemas) and in `orbit-api/**/DTOs/*.cs` (records / classes).
2. A **removed line** declaring a field (`fieldName: z.…` removed with no matching add),
   OR a **renamed field** (one field removed + one added in the same schema, types
   compatible), is a candidate.
3. Classify each candidate and tag per `rubric.md` dimension 11:
   - Removed/renamed in a **response** shape → old readers get `undefined` →
     **`⚠️ breaks old mobile clients` (Critical)**, unless already optional AND unused
     (cite the grep).
   - Removed/renamed in a **request** shape, or a field made **newly-required** → old
     senders are rejected by validation → **`⚠️ breaks old mobile clients` (Critical)**.
   - **Added optional** field → forward-compatible → **Info**.
   - **Enum value removed** → old clients may still send it → flag.
4. In the fix, recommend the compatible alternative: keep-and-deprecate the old field,
   accept both names server-side for a release, or gate behind the min-version gate.
   When old-client reach is uncertain, downgrade to **High** with a "verify old-client
   usage" note rather than over-claiming Critical.

Scope is **field add/remove/rename in the reviewed diff**. Semantic/behavioral breaks
under an unchanged field name are caught by Correctness (#1) and the human reviewer — do
not over-claim completeness here.

---

## Phase 6 — Validate

Run the affected-repo checks by **delegating to the `/validate` skill** (auto-detects
frontend / backend / both) rather than hardcoding a second copy of the command set —
one source of truth for how Orbit validates. Skip the repo the diff never touched.
Record each result as PASS / FAIL with the error summary for the report's validation
table. For a file/folder scope with no working-tree changes, validation is N/A.

---

## Phase 7 — Report

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
{findings in the rubric template, or "None" — `⚠️ breaks old mobile clients` findings sort here first}

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

## Validation

| Check | Result |
|---|---|
| Lint | PASS / FAIL / N/A |
| Type check | PASS / FAIL / N/A |
| Tests | PASS / FAIL / N/A |
| Build (api) | PASS / FAIL / N/A |

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
  posting step). In CI also skip Phase 6, and mark any dimension that needs the
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
