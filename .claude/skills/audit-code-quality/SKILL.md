---
name: audit-code-quality
description: Repo-wide code-quality audit across both Orbit repos against the same rubric /pr-review uses. Reports dead/stale code, SOLID/clean-arch violations, comment-policy breaks, DRY, naming, function size, and DESIGN.md drift — each finding evidence-backed with file:line. Use when the user asks to audit code quality, find tech debt, or check the codebase against the standards. Not for a single diff (use /pr-review).
argument-hint: <path | workspace | repo | blank=both repos>
---

# Audit Code Quality

**Input**: $ARGUMENTS

Walk the **whole repo** (or a scoped path) against `rubric.md` — the *same* rubric
`/pr-review` walks over a diff — and produce one severity-ranked report of real
quality debt. `/pr-review` reviews what changed; this audits what *exists*.

The fan-out, the adversarial verify, and the loop-until-dry run as the **`audit` dynamic
workflow** (`.claude/workflows/audit.mjs`) — **Haiku finders + Haiku skeptics**,
deterministic orchestration — so Opus spends tokens only on **this synthesis**.

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

**Self-contained**: the workflow's finder/skeptic agents read local repo files and run
`git` / `rg` against the project's own checkout. **CI / headless fallback**: if the
`Workflow` tool is unavailable, run the fan-out inline per Phase 3's fallback.

---

## Phase 1 — Resolve scope

Parse `$ARGUMENTS` into a `{scope}` token for the workflow.

| Input | `{scope}` |
|---|---|
| Blank | `both` (both repos, source dirs only) |
| `frontend` / `ui` / `mobile` / `web` | `ui` |
| `backend` / `api` | `api` |
| A path | the path itself |

**Repo roots:**

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

The workflow excludes generated / vendored / test-fixture code (`node_modules`, `.next`,
`dist`, `build`, `bin`, `obj`, `coverage`, `.turbo`, `Migrations/`, `design/handoff/`,
`.claude/`). Load **`.claude/skills/_shared/verification-protocol.md`** — the workflow
executes §1/§2/§3; you emit the Verify summary + Deferred ledger (§4/§5).

---

## Phase 2 — Run the audit workflow (Haiku fan-out + adversarial verify)

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/audit.mjs', args: { kind: 'code-quality', scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical — named workflow resolution is not available in this Claude Code build.)

It fans out **one Haiku finder per area** — `apps/web` · `apps/mobile` · `packages/shared`
· `orbit-api/src/Orbit.Application` · `orbit-api/src/{Orbit.Domain,Orbit.Infrastructure,
Orbit.Api}` — each reading `.claude/skills/pr-review/rubric.md`; runs a **Haiku skeptic**
per **Critical/High** finding (default-refuted, re-runs the zero-reference grep for dead-code
claims); loops a completeness critic until dry (cap 2 dry rounds). It returns:

```
{ findings: [{ severity, title, category, location, evidence, rationale, fix, reference }],
  counts, coverage, deferred, rounds, scopeLabel }
```

The workflow **keeps Low/Info** (the sanctioned deep-audit exception) and ranks by
blast-radius × churn. Diff-only dimensions — contract drift / backward-compat (#11) and the
security orchestration — are **not** re-derived here; note them as "covered by
/audit-security" in the report.

**Fallback (no `Workflow` tool):** run the fan-out inline — `Explore` finders (Haiku, 3
concurrent) over the five areas against the shared rubric, Haiku skeptics per Critical/High
finding, a completeness pass — same findings shape.

---

## Phase 2.5 — React Doctor pass (ui / frontend / both scope)

For any scope that includes the frontend, also run the deterministic **React-correctness
scanner** — it catches state/effects, hydration, perf, and a11y bugs the rubric's LLM finders
miss, and it is a **required CI check** (`.github/workflows/react-doctor.yml`):

```bash
npx -y react-doctor@0.7.6 --project apps/web,apps/mobile,packages/shared \
  --json --json-out "${TMPDIR:-/tmp}/rd-audit.json" \
  --no-supply-chain --no-score --no-dead-code --yes --max-duration 360 --no-color
```

Scope to the three workspaces via `--project` — this **excludes `design/handoff/**`**, whose
vendored `*.jsx` design mockups emit ~1054 false `jsx-no-undef` errors that are not app code.
The flags match the CI gate's hermetic/no-knip stance; the CI gate is `--scope changed`, so it
never sees the standing backlog this full scan surfaces. Fold every diagnostic into the report
(the JSON's paths are workspace-relative — prefix with the project): react-doctor **errors** →
**High** (real React bugs), **warnings** → **Low/Info**, each tagged `[react-doctor · {rule}]`
with file:line + the rule's fix; group warnings by rule with a count. `api` scope skips this
(React-only). Report-only — surface findings, do not fix here.

---

## Phase 3 — Apply the rubric (what a repo-wide audit recalibrates)

The rubric was written for a diff; the workflow's finders already recalibrate two rules —
**confirm the return reflects them:**

- **Signal gate:** Low/Info are **kept** here (the sanctioned deep-audit exception),
  bucketed separately so Critical/High debt stays legible. Never manufactured to pad.
- **"Focus on changed code":** there is no diff — every source line is fair game, ranked by
  blast radius × churn (a smell in a hot handler outranks the same in a stable leaf).

High-value dimensions for a standing codebase (the finders lead with these): **dead/stale
code (#2)** proven by a zero-reference grep · **SOLID/clean-arch (#3)** (functions over the
~50/~100-line caps, nesting past ~3, premature abstraction, DRY-at-the-wrong-level) ·
**comment policy (#4)** (fix = rename/extract) · **naming** (`data`/`info`/`temp`/`helper`/
`util` finals, abbreviations) · **DESIGN.md drift (#8)** on `apps/*` UI.

---

## Phase 4 — Synthesize the report (Opus)

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/code-quality-{scope}.md`

Bucket the workflow's `findings` by severity (keeping the Low/Info bucket), rank the
Hotspots from the highest-debt files, fill coverage from `coverage`, carry `deferred`
verbatim:

```markdown
# Code-Quality Audit: {SCOPE}

**Scope**: {scopeLabel}
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

{From the workflow's `deferred` + dimensions deferred to `/audit-security` or `/pr-review`
+ any slice the run did not reach — each with a one-line reason. "Nothing deferred — full
coverage" if empty.}

## What's good

{Genuine strengths — patterns worth keeping. Not filler.}
```

For a `frontend`/`ui` scope, cross-check parity intent: a dead export in `apps/web` whose
mirror is still live in `apps/mobile` (or vice-versa) is a parity finding, not just dead
code — call it out.

Each finding uses the rubric's finding template.

---

## Guardrails — do NOT

- **Fork the rubric.** The workflow's finders read `.claude/skills/pr-review/rubric.md`;
  never inline a copy of the dimensions here. One file, zero drift — the whole point of #228.
- **Re-run /pr-review's diff job.** This audits the repo as it stands, not a change.
- **Re-derive security or contract findings.** Point at `/audit-security` and
  `/audit-tests`; stay in the quality lane.
- **Re-run the workflow's analysis.** It owns the fan-out, the grep-proof skeptic pass, and
  the loop; you synthesize its return. Only re-invoke for a coverage gap.
- **Trust an un-proven dead-code claim.** Every dead-code finding carries the zero-reference
  grep that proves it (the skeptic re-runs it) — drop any that lack one.
- **Refactor during the audit.** Findings first; write code only if the user asks after.
- **Pad the list.** A clean area gets "None," not invented Low nits.

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
