---
name: audit-code-quality
description: Repo-wide code-quality audit across both Orbit repos against the same rubric /pr-review uses. Reports dead/stale code, SOLID/clean-arch violations, comment-policy breaks, DRY, naming, function size, and DESIGN.md drift — each finding evidence-backed with file:line. Use when the user asks to audit code quality, find tech debt, or check the codebase against the standards. Not for a single diff (use /pr-review).
argument-hint: <path | workspace | repo | blank=both repos>
context: fork
---

# Audit Code Quality

**Input**: $ARGUMENTS

Walk the **whole repo** (or a scoped path) against `rubric.md` — the *same* rubric
`/pr-review` walks over a diff — and produce one severity-ranked report of real
quality debt. `/pr-review` reviews what changed; this audits what *exists*.

**Golden rule**: every finding cites a file:line and the rubric rule it traces to, and
carries a concrete fix. No vibes, no "consider maybe" — if it can't be pinned to a line,
it isn't a finding.

---

## Phase 0 — Provenance & self-containment

This skill **shares one rubric file** with `/pr-review`:
`.claude/skills/pr-review/rubric.md`. There is no second copy and no fork of the rules —
both skills read that exact file, so the diff-review and the repo-audit can never drift
(the #228 requirement). The rubric's own dimensions were adapted at authoring time from
the **code-review base on claudeskills.info** (https://claudeskills.info) and specialized
to Orbit's ten Code Standards, the orbit-api hard rules, `eslint-rules/no-comments.cjs`,
and `DESIGN.md` — see the rubric's Phase 0 note. That URL is the single WHY-with-URL the
comment policy allows.

**Self-contained**: no network call at run time, no marketplace dependency. It reads
local repo files and runs `git` / `rg` against the project's own checkout, so it works
unchanged in CI.

---

## Phase 1 — Resolve scope

Parse `$ARGUMENTS` into a target and the repos it covers.

| Input | Scope |
|---|---|
| Blank | **both repos**, source dirs only (see exclusions) |
| `frontend` / `ui` / `mobile` / `web` | `orbit-ui-mobile` (the matching workspace, or all three) |
| `backend` / `api` | `orbit-api/src` |
| A path | just that file or folder |

**Repo roots:**

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

**Exclude from the walk** (never audit generated / vendored / test-fixture code):
`node_modules`, `.next`, `dist`, `build`, `bin`, `obj`, `coverage`, `.turbo`,
`Migrations/` (EF-generated), `design/handoff/` (vendored canon), `*.lock`, `.claude/`.
Source globs: `**/*.{ts,tsx}` (frontend), `**/*.cs` (backend). Test files (`*.test.ts`,
`*.spec.ts`, `tests/**`, `*Tests.cs`) are in-scope for naming/size/dead-code but exempt
from the `console.log` and comment-narration rules.

---

## Phase 2 — Load context

In parallel:

- **`.claude/skills/pr-review/rubric.md`** — the dimensions, severities, and finding
  template this audit walks. **This is the contract; read it first.**
- Root `CLAUDE.md` (+ the scoped workspace `CLAUDE.md` for each workspace in scope) in
  `orbit-ui-mobile`.
- `orbit-api/CLAUDE.md` (+ scoped project `CLAUDE.md`) — only if backend is in scope.
- `DESIGN.md` (repo root) — only if `apps/*` UI files are in scope (dimension 8).
- `eslint-rules/no-comments.cjs` — the exact comment rule dimension 4 mirrors.
- **`.claude/skills/_shared/verification-protocol.md`** — the shared reliability contract;
  its Verify phase and Deferred ledger run below.

---

## Phase 3 — Fan out the audit by area

A whole-repo walk is large; delegate it the way the root CLAUDE.md prescribes — fan out
**`Explore` subagents**, **3 concurrent at a time**, each owning a non-overlapping slice
and returning findings in the rubric's finding template. Slice by area so two agents
never read the same files:

| Slice | Target | Rubric dimensions in focus |
|---|---|---|
| Web app | `apps/web/` | 2, 3, 4, 6, 7, 8, 9, 10 |
| Mobile app | `apps/mobile/` | 2, 3, 4, 6, 7, 8, 9, 10 |
| Shared | `packages/shared/` | 2, 3, 4, 6, 9, 10, 11 |
| API application | `orbit-api/src/Orbit.Application/` | 2, 3, 4, 5, 6, 13 |
| API domain + infra + api | `orbit-api/src/{Orbit.Domain,Orbit.Infrastructure,Orbit.Api}/` | 2, 3, 4, 6, 13 |

Queue slices past the third. Each subagent prompt embeds:

> **Objective**: audit `<slice path>` against `.claude/skills/pr-review/rubric.md`,
> dimensions <list>. **Read the rubric first.** For every issue, emit the rubric's
> finding template with an exact `file:line`, a severity from the ladder, and a concrete
> fix. **Run zero-reference greps to prove dead code** (don't guess). Exclude
> generated/vendored dirs. Return findings only — no narration, no padding.

Skip parity (#9) for a single-app scope (nothing to mirror against) and DESIGN.md (#8)
when the slice has no UI. Drop the diff-only dimensions: **contract drift /
backward-compat (#11)** and the **security** orchestration belong to `/pr-review` and
`/audit-security` respectively — note them as "covered by /audit-security" rather than
re-deriving here.

---

## Phase 4 — Apply the rubric (what changes for a repo-wide audit)

The rubric was written for a diff; two of its rules need recalibration when the surface
is the entire repo:

- **Signal gate (rubric):** on a PR, Low/Info are noise and get dropped. **A deep audit
  is the sanctioned exception** — the rubric itself says "a local deep audit may list
  Low/Info." So **keep** Low/Info here, but bucket them separately so the Critical/High
  debt stays legible. Still never manufacture a finding to pad the list.
- **"Focus on changed code":** there is no diff — every source line is fair game. But
  **rank by blast radius and churn**: a SOLID violation in a hot, frequently-edited
  handler outranks the same smell in a stable leaf file. Lead with what hurts most.

Walk every in-scope dimension. The high-value ones for a standing codebase:

- **Dead / stale code (#2)** — the audit's flagship. Hunt orphaned exports, unreachable
  branches, commented-out blocks, stub functions, and speculative parameters across the
  *whole* tree (a diff can't see these; an audit can). **Prove each with a
  zero-reference grep** — cite the command and its empty result.
- **SOLID / clean-arch (#3)** — functions over the ~50-line soft cap / ~100 hard cap,
  nesting past ~3, premature abstraction, and DRY-at-the-wrong-level. List the worst
  offenders by line count.
- **Comment policy (#4)** — flag a comment exactly where `no-comments.cjs` would. The fix
  is rename-the-symbol / extract-a-function, never "reword."
- **Naming (#9 in CLAUDE.md → rubric #3 family)** — `data` / `info` / `temp` / `helper`
  / `util` as final names, abbreviations, names a stranger can't guess from the call site.
- **DESIGN.md drift (#8)** — raw `--slate-*`, hardcoded violet rgba, `transition-all`,
  `h-screen`, cards-in-cards, the AI-slop tells. Gated to `apps/*` UI files.

---

## Phase 5 — Verify (adversarial + completeness)

Before writing the report, run `.claude/skills/_shared/verification-protocol.md` — a
finding ships only after it survives a challenge, and the sweep must prove it covered the
tree.

1. **Adversarial pass (§2).** For every **Critical / High** finding, spawn an independent
   skeptic subagent (3 concurrent) whose only job is to *refute* it — read the cited
   `file:line` in full context and argue it is a false positive (the reference actually
   exists so it is not dead — re-run the grep, the function is within the cap, the
   abstraction is intentional and defensible, a duplicate). Default to refuted when
   uncertain. Drop or downgrade anything the skeptic disproves; survivors ship with
   confidence.
2. **Completeness critic + loop-until-dry (§3).** Run a fresh critic asking *"what did this
   audit NOT examine — a code slice never swept, a directory skipped, a dead-code claim
   unproven by a grep?"* Spawn a focused finder round on each gap it names; repeat until a
   round surfaces nothing new (cap: 2 dry rounds — log it).
3. **Deferred ledger (§4).** Roll everything in scope but un-verdicted (dimensions owned by
   `/audit-security` and `/pr-review`, a slice left unswept) into the report's **Deferred**
   section, one reason each — never implied as clean.

---

## Phase 6 — Report

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/code-quality-{scope}.md`

```markdown
# Code-Quality Audit: {SCOPE}

**Scope**: {both repos / workspace / path}
**Rubric**: `.claude/skills/pr-review/rubric.md` (shared with /pr-review)
**Health**: {1-line verdict — e.g. "Solid; 2 dead exports + 1 oversized handler"}

## Findings

### Critical
{rubric-template findings, or "None"}

### High
{… or "None"}

### Medium
{… or "None"}

### Low / Info
{audit-only bucket — dead nits, minor naming, micro-cleanup. "None" if clean.}

## Hotspots

{The 3-5 files carrying the most debt, ranked. One line each: file — what's wrong.}

## Coverage

| Area | Audited | Notable |
|---|---|---|
| apps/web | yes/no | {count by severity} |
| apps/mobile | yes/no | {…} |
| packages/shared | yes/no | {…} |
| orbit-api | yes/no | {…} |

## Deferred — in scope but not verdicted

{Per the verification protocol §4: slices the sweep did not reach with a verdict,
dimensions deferred to `/audit-security` or `/pr-review`, capped coverage — each with a
one-line reason. "Nothing deferred — full coverage" if the contract was met.}

## What's good

{Genuine strengths — patterns worth keeping. Not filler.}
```

For a `frontend` audit, cross-check parity intent: a dead export in `apps/web` whose
mirror is still live in `apps/mobile` (or vice-versa) is a parity finding, not just dead
code — call it out.

---

## Guardrails — do NOT

- **Fork the rubric.** Read `.claude/skills/pr-review/rubric.md`; never inline a copy of
  the dimensions here. One file, zero drift — that is the whole point of #228.
- **Re-run /pr-review's diff job.** This audits the repo as it stands, not a change.
- **Re-derive security or contract findings.** Point at `/audit-security` and
  `/audit-tests`; stay in the quality lane.
- **Guess at dead code.** Every dead-code finding carries the zero-reference grep that
  proves it.
- **Refactor during the audit.** Findings first; write code only if the user asks after.
- **Pad the list.** A clean area gets "None," not invented Low nits.
- **Audit generated / vendored code** (`Migrations/`, `design/handoff/`, `node_modules`).

---

## Output

```markdown
## Audit Complete — Code Quality

**Scope**: {what was audited}
**Health**: {1-line verdict}

| Severity | Count |
|---|---|
| Critical | {N} |
| High | {N} |
| Medium | {N} |
| Low / Info | {N} |

**Report**: `.claude/audits/code-quality-{scope}.md`
**Top fix**: {the single highest-leverage thing to do first}
```
