---
name: audit-security
description: Repo-wide security audit across both Orbit repos (orbit-ui-mobile + orbit-api). Checks authz / data-isolation (incl. AI & MCP tool scoping), injection, secrets, CORS, rate-limit coverage, AI-abuse, and error leakage. Each finding carries severity, file:line evidence, threat model, and remediation, calibrated to Tier 1+2 (Tier 3 marked out-of-scope). Self-contained — runs in CI. Use when the user asks for a security audit, threat review, or pre-launch hardening pass.
argument-hint: <path | repo | blank=both repos>
---

# Audit Security

**Input**: $ARGUMENTS

Run a repo-wide security audit across **both** Orbit repos and produce one
severity-ranked, evidence-backed report of real risks — each finding pinned to a
file:line, with the threat it enables and the fix that closes it.

The fan-out, the adversarial verify, and the loop-until-dry now run as the **`audit`
dynamic workflow** (`.claude/workflows/audit.mjs`) — **Haiku finders + Haiku skeptics**,
deterministic orchestration — so Opus spends tokens only on **this synthesis**. That is the
model-routing win: cheap discovery, expensive judgment only where it pays.

**Golden rule**: every finding is a *concrete, exploitable-or-not* claim tied to a
file:line and a threat, calibrated to Orbit's actual scale. No theater — a finding either
names how an attacker (or a buggy client, or another user) reaches it, or it isn't a
finding. **Right-size to the tiers below**; do not paste enterprise checklists a solo,
pre-scale app will never hit.

---

## Phase 0 — Provenance, tiers & self-containment

The categories in `checklist.md` were assembled at authoring time from the
**security-review / code-review base on claudeskills.info**
(https://claudeskills.info) and OWASP's Top 10 + API Top 10, then specialized to Orbit's
own security boundaries (auth cookie httpOnly+strict+secure, mobile SecureStore, the
backend `[Authorize]`-by-default rule, CORS/Stripe/webhook config, and the **AI/MCP tool
scoping** surface). That URL is the single WHY-with-URL the comment policy allows.

**Self-contained**: no network call at run time, no marketplace dependency, no live
scanner. The workflow's finder/skeptic agents read local repo files and run `git` / `rg`
against the project's own checkout. **CI / headless fallback**: if the `Workflow` tool is
unavailable (e.g. a headless runner whose tool allowlist omits it), run the fan-out inline
per **Phase 2's fallback** — the audit still completes against the same checkout.

### Severity tiers — calibrate every finding

Orbit is a **solo-dev, pre-full-scale** habit tracker with real users and **live billing**
+ **AI agent tools that mutate user data**. Audit to Tier 1 + Tier 2; mark Tier 3
explicitly out-of-scope so the report stays decision-ready, not a fear list.

| Tier | What it covers | In this audit? |
|---|---|---|
| **Tier 1 — Must fix** | Cross-user data access, auth bypass, secret leakage, injection, an AI/MCP tool that mutates another user's data, payment/webhook forgery. Exploitable now, real blast radius. | **Yes — block on these.** |
| **Tier 2 — Should fix** | Missing rate-limit on an abusable/expensive route (auth, AI), verbose error leakage, defense-in-depth gaps, missing input validation at a boundary, permissive CORS that isn't yet exploitable. | **Yes — fix before/at launch.** |
| **Tier 3 — Enterprise / not-yet** | WAF, SIEM, pen-test cadence, secrets-vault rotation, DDoS scrubbing, SOC2 controls, threat-intel feeds. Real at scale, noise for a solo pre-launch app. | **No — list as "out of scope (Tier 3)" and move on.** |

When old-client reach or real-world exploitability is uncertain, say so and pick the
lower tier with a "verify" note — never inflate to Tier 1 to look thorough.

---

## Phase 1 — Resolve scope

Parse `$ARGUMENTS` into a `{scope}` token to pass to the workflow: blank → `both`;
`api`/`backend` → `api`; `frontend`/`web`/`mobile` → `ui`; a path → the path itself.

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

Load **`.claude/skills/_shared/verification-protocol.md`** — the shared reliability
contract. The workflow *executes* its coverage contract (§1), adversarial verify (§2), and
loop-until-dry (§3); you *emit* the Verify summary + Deferred ledger from the workflow's
return (§4/§5).

---

## Phase 2 — Run the audit workflow (Haiku fan-out + adversarial verify)

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/audit.mjs', args: { kind: 'security', scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical — named workflow resolution is not available in this Claude Code build.)

It fans out **one Haiku finder per attack surface** — authz & data-isolation · AI/MCP tool
scoping · injection · secrets & config · rate-limit & AI-abuse · error-leakage & web/mobile
auth — each reading `checklist.md`; runs a **Haiku adversarial skeptic** per **Tier-1/Tier-2**
finding (default-refuted); runs a **completeness critic** and loops until dry (cap 2 dry
rounds). It returns:

```
{ findings: [{ severity, title, category, location, evidence, rationale, fix, reference }],
  counts, coverage, deferred, rounds, converged, convergenceReason, criticErrors, scopeLabel }
```

**Completeness is a computed field, not an assumption.** `converged === true` only after the
critic ran and returned empty. If `converged !== true` (e.g. `criticErrors ≥ 2` from a
rate-limit), the sweep did NOT prove completeness — report it as "coverage UNKNOWN —
${convergenceReason}", never as a clean/complete audit. A dead verifier is not a clean pass.

`rationale` carries the **threat**. The surfaces + the completeness critic together own the
Orbit-specific must-checks (Phase 3) — if the returned `coverage` omits one, add it as a
gap and re-invoke the workflow with a narrowed scope.

**Fallback (no `Workflow` tool — headless/CI):** run the fan-out inline instead — spawn
`Explore` finders (Haiku, 3 concurrent) over the six surfaces against `checklist.md`, then
Haiku skeptics per Tier-1/2 finding, then a completeness pass — exactly the workflow's
phases, per verification-protocol §2/§3. Same findings shape.

---

## Phase 3 — The Orbit-specific must-checks (the workflow encodes these; confirm the return covers them)

These are where a habit tracker with AI tools and billing actually bleeds. The workflow's
surfaces target each; **confirm the returned findings/coverage address every one**, and
re-invoke for any gap:

1. **Every data query is user-scoped** — each orbit-api handler filters by the JWT `userId`,
   never a client field. An `id` loaded without an ownership check is a **Tier 1 IDOR**.
2. **AI / MCP tools cannot cross users** — the agent operations derive `userId` from the
   session; no tool accepts a target-user parameter. A raw-id mutator is **Tier 1**.
3. **AI-abuse / prompt-injection** — the AI endpoint is rate-limited + size-capped; a crafted
   prompt cannot make a tool act outside the user's data or run an unbounded-cost loop; model
   output never *authorizes*.
4. **`[Authorize]` by default** — every endpoint requires JWT Bearer unless `/health` or
   `/api/auth/*`. Neither `[Authorize]` nor `[AllowAnonymous]` = **Tier 1**.
5. **Payment & webhook integrity** — Stripe/Play webhooks verify their signature; the Stripe
   key is set globally, never per-request. Unverified webhook = **Tier 1**.
6. **Secrets never in source** — no JWT secret, DB password, OpenAI/Stripe/Play key, or VAPID
   private key committed. A committed secret is **Tier 1**.
7. **Boundary flags intact** — web cookie httpOnly+strict+secure; mobile tokens in SecureStore;
   CORS not `AllowAnyOrigin()` with `AllowCredentials()`; security-headers middleware live.

---

## Phase 4 — Synthesize the report (Opus)

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/security-{scope}.md`

Bucket the workflow's `findings` onto the tiers (Tier 1 = `Tier 1` severities, Tier 2 =
`Tier 2`), render each in the finding template, fill the coverage table from `coverage`, and
carry `deferred` verbatim into the Deferred ledger:

```markdown
# Security Audit: {SCOPE}

**Scope**: {scopeLabel}
**Calibration**: Tier 1 (must fix) + Tier 2 (should fix); Tier 3 listed as out-of-scope.
**Posture**: {1-line verdict — e.g. "No cross-user holes found; 1 unrated AI endpoint missing a rate limit"}

## Findings

### Tier 1 — Must fix (exploitable now)
{findings in the template, or "None"}

### Tier 2 — Should fix (before/at launch)
{… or "None"}

## Out of scope (Tier 3 — enterprise, not yet)
{one line each: WAF, secrets-vault rotation, SIEM, … — acknowledged, deliberately deferred}

## Surface coverage

| Surface | Audited | Result |
|---|---|---|
| AuthZ & data-isolation | yes/no | clean / N findings |
| AI / MCP tool scoping | yes/no | … |
| Injection | yes/no | … |
| Secrets & config | yes/no | … |
| Rate-limit & AI-abuse | yes/no | … |
| Error leakage & web/mobile auth | yes/no | … |

## Deferred — in scope but not verdicted

{From the workflow's `deferred` (verify-cap overflow, loop bound) + any surface the run did
not reach + Tier-3 controls — each with a one-line reason. "Nothing deferred — full
coverage" if empty.}

## What's solid

{Genuine strengths — controls done right. Not filler.}
```

### Finding template

```
[TIER N] <one-line title>
· category: <checklist section — e.g. A. AuthZ / data-isolation>
· location: <repo>/<path>:<line>
· threat: <who reaches it (other user / anon / forged webhook / crafted prompt) and what they get>
· evidence: <the line that proves it — e.g. "query loads habit by id with no userId filter">
· fix: <the concrete change>
· reference: <CLAUDE.md security boundary | orbit-api hard rule | OWASP A0x | checklist section>
```

---

## Guardrails — do NOT

- **Inflate severity.** Tier-1 means *exploitable now with real blast radius*. Uncertain
  exploitability → lower tier + a "verify" note. Never manufacture a Tier-1 to look thorough.
- **Paste enterprise checklists.** Tier-3 controls (WAF, SIEM, SOC2, vault rotation) get
  one acknowledging line in "out of scope," not a finding each. Right-size to a solo
  pre-scale app.
- **Report a finding with no threat.** If you can't name who reaches it and what they get,
  it's an observation, not a security finding.
- **Trust the model for authz.** Flag any path where an AI tool's output decides access —
  authorization is server-side, always.
- **Re-run the workflow's analysis.** It owns the fan-out, the skeptic pass, and the loop;
  you synthesize its return. Only re-invoke for a coverage gap.
- **Remediate during the audit.** Findings first; fix only if the user asks after.

---

## Output

```markdown
## Audit Complete — Security

**Scope**: {what was audited}
**Posture**: {1-line verdict}

| Tier | Count |
|---|---|
| Tier 1 (must fix) | {N} |
| Tier 2 (should fix) | {N} |
| Tier 3 (out of scope) | {acknowledged, not counted} |

**Report**: `.claude/audits/security-{scope}.md`
**Top risk**: {the single highest-priority thing to fix first, or "no Tier-1 findings"}
```
