---
name: audit-code-quality
description: >-
  Repo-wide code-quality audit across both Orbit repos, opening one Linear ticket per verified debt after a human approval gate (D10). Finds the judgement-level debt no gate can see (D11): dead/stale code, SOLID/clean-arch violations, DRY-at-the-wrong-level, naming, function size, and non-gated DESIGN.md drift, each evidence-backed with file:line. EXCLUDES the mechanical layer (comment policy, spacing scale, react-doctor, dashes, and every ESLint local/Roslyn rule). Use when the user asks to audit code quality, find tech debt, or check the codebase against the standards. Not for a single diff (use /pr-review).
argument-hint: <path | workspace | repo | blank=both repos>
---

# Audit Code Quality

**Input**: $ARGUMENTS

Walk the **whole repo** (or a scoped path) against `rubric.md` — the *same* rubric
`/pr-review` walks over a diff, and opens one Linear ticket per verified debt (D10).
`/pr-review` reviews what changed; this audits what *exists*. The output is executable
tickets behind one approval gate, never a report that rots the day after it is written.

The fan-out, the adversarial verify, and the loop-until-dry run as the **`audit` dynamic
workflow** (`.claude/workflows/audit.mjs`) — **Haiku finders + Haiku skeptics**,
deterministic orchestration — so Opus spends tokens only on **this synthesis**.

**Golden rule**: every finding cites a file:line and the rubric rule it traces to, and
carries a concrete fix. No vibes, no "consider maybe" — if it can't be pinned to a line,
it isn't a finding.

---

## Phase 0 — Provenance & self-containment

This skill **shares one rubric file** with `/pr-review`:
`.claude/skills/pr-review/rubric.md` (the #228 no-drift requirement). The rubric's own
dimensions were adapted at authoring time from
the **code-review base on claudeskills.info** (https://claudeskills.info) and specialized
to Orbit's ten Code Standards, the orbit-api hard rules, `eslint-rules/no-comments.cjs`,
and `DESIGN.md` — see the rubric's Phase 0 note. That URL is the single WHY-with-URL the
comment policy allows.

**Self-contained**: the workflow's finder/skeptic agents read local repo files and run
`git` / `rg` against the project's own checkout.

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
`.claude/`). Load **`.claude/skills/_shared/verification-protocol.md`** (the workflow
executes §1/§2/§3; you carry the Verify summary + Deferred ledger §4/§5 into the approval
gate) and **`.claude/skills/_shared/audit-to-tickets.md`** (the D10 ticket-emission pipeline
Phase 4 runs).

### D11 scope: judgement only, never what a gate checks

Read **`.claude/skills/_shared/gate-owned-exclusions.md`**. The shared rubric was written for
`/pr-review` over a diff; as a standing audit this skill audits ONLY the rubric dimensions no
gate enforces. It does NOT re-flag: comment policy (ESLint `local/no-comments` + Roslyn
`ORBIT0001`), the enumerated spacing scale (`local/spacing-scale`), `console` / `any` bans,
dashes, copy register, React correctness (`react-doctor.yml`), or any other `local/*` /
`guards.yml` / `ORBIT0001..0005` concern. It DOES own: dead/stale code, SOLID/clean-arch
(function size over the ~50/~100-line caps, nesting past ~3, premature abstraction), DRY-at-
the-wrong-level, naming judgement, and the DESIGN.md drift no lint rule covers (visual
hierarchy, semantic-token misuse beyond spacing/dash/copy).

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
  counts, coverage, deferred, rounds, converged, convergenceReason, loopBound, criticErrors, scopeLabel }
```

**Completeness is a computed field, not an assumption.** `converged === true` only after the
critic ran and returned empty. Anything else (e.g. `criticErrors ≥ 2` from a rate-limit)
reports as "coverage UNKNOWN, ${convergenceReason}": a dead verifier is not a clean pass.

Diff-only dimensions (contract drift / backward-compat (#11) and the security orchestration)
are **not** re-derived here; note them as "covered by /audit-security" at the approval gate,
never as a code-quality ticket.

**Fallback (no `Workflow` tool):** run the fan-out inline, `audit-readonly` finders (Haiku,
3 concurrent) over the five areas against the shared rubric, Haiku skeptics per Critical/High
finding, a completeness pass, same findings shape. The fallback keeps the primary path's
agent type on purpose: an audit reads, so its workers carry no write, edit, or shell tools
either way.

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
**naming** (`data`/`info`/`temp`/`helper`/`util` finals, abbreviations) · **DESIGN.md drift
(#8)** on `apps/*` UI, but only the drift no lint rule covers.

---

## Phase 4: Emit tickets (D10), not a report

Run the shared pipeline in **`.claude/skills/_shared/audit-to-tickets.md`**: one Linear
ticket per verified debt, drafted to the 6.2 template, validated by
`node tools/check-ticket.mjs --file`, presented behind ONE approval gate, then created via
`orca linear create` and re-validated with `--issue`.

Code-quality-specific mapping into the 6.2 body:

- **Problem / why it matters** carries the rubric dimension it breaks (`reference`) and, from
  `rationale`, why it is real debt (blast-radius × churn).
- **Technical details** carries the `evidence`; a dead-code ticket carries the zero-reference
  grep command and its empty result that PROVES the code is dead (drop any dead-code finding
  that lacks it).
- **Scope** is the concrete `fix`: delete the dead export, split the oversized function,
  collapse the premature abstraction, rename the `data`/`temp` symbol.
- Fold Low/Info nits that share a cleanup and PR into one ticket rather than minting a ticket
  per trivial nit; a systemic Low pattern (e.g. one naming smell across a folder) is one
  ticket, not twenty. `repo:*` from `location`; ui tickets carry `parity:yes|no`.
- For a `frontend`/`ui` scope, a dead export in `apps/web` whose mirror is still live in
  `apps/mobile` (or vice-versa) is a parity ticket, not just dead code: say so in the body.

At the approval gate, present the Hotspots (the 3-5 highest-debt files) and per-area
**coverage** (apps/web, apps/mobile, packages/shared, orbit-api) as provenance, plus the
**Deferred ledger** (the workflow's `deferred`, dimensions deferred to `/audit-security` or
`/pr-review`) and the convergence state.

---

## Guardrails — do NOT

- **Fork the rubric.** The workflow's finders read `.claude/skills/pr-review/rubric.md`;
  never inline a copy of the dimensions here. One file, zero drift — the whole point of #228.
- **Re-derive security or contract findings.** Point at `/audit-security` and
  `/audit-tests`; stay in the quality lane.
- **Re-run the workflow's analysis.** You turn its return into tickets; only re-invoke for a
  coverage gap.
- **Trust an un-proven dead-code claim.** Every dead-code ticket carries the zero-reference
  grep that proves it (the skeptic re-runs it) — drop any that lack one.
- **Write a report file, or create tickets unattended.** The output is Linear tickets behind
  the one approval gate; nothing is persisted to `.claude/audits/`.
- **Refactor during the audit.** Tickets first; write code only if the user asks after.
- **Pad the backlog.** A clean area produces no ticket, not an invented Low nit.

---

## Output

```markdown
## Audit Complete — Code Quality

**Scope**: {what was audited}
**Health**: {1-line verdict, e.g. "Solid; 2 dead exports + 1 oversized handler"}

| Severity | Findings | Tickets |
|---|---|---|
| Critical | {N} | {created / pending approval} |
| High | {N} | {…} |
| Medium | {N} | {…} |
| Low / Info | {N} | {folded / …} |

**Tickets**: {the final ORB-N table, identifier · title · repo · blockedBy, or "clean: no judgement-level debt beyond the gates"}
**Top fix**: {the single highest-leverage ticket to pick up first}
```
