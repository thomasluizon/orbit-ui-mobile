---
name: audit-security
description: Repo-wide security audit across both Orbit repos (orbit-ui-mobile + orbit-api). Checks authz / data-isolation (incl. AI & MCP tool scoping), injection, secrets, CORS, rate-limit coverage, AI-abuse, and error leakage. Each finding carries severity, file:line evidence, threat model, and remediation, calibrated to Tier 1+2 (Tier 3 marked out-of-scope). Self-contained — runs in CI. Use when the user asks for a security audit, threat review, or pre-launch hardening pass.
argument-hint: <path | repo | blank=both repos>
context: fork
---

# Audit Security

**Input**: $ARGUMENTS

Run a repo-wide security audit across **both** Orbit repos and produce one
severity-ranked, evidence-backed report of real risks — each finding pinned to a
file:line, with the threat it enables and the fix that closes it.

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
scanner. It reads local repo files and runs `git` / `rg` against the project's own
checkout — so it works unchanged in CI (the #212 requirement).

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

## Phase 1 — Resolve scope & load context

Parse `$ARGUMENTS`: blank → **both repos**; `api`/`backend` → orbit-api; `frontend`/`web`/
`mobile` → orbit-ui-mobile; a path → just that path.

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

Load in parallel: **`checklist.md`** (this skill's category list — read it first), root
`CLAUDE.md` "Security boundaries", and `orbit-api/CLAUDE.md` "Cross-cutting hard rules"
(if backend in scope). Exclude generated/vendored dirs (`node_modules`, `bin`, `obj`,
`Migrations/`, `design/handoff/`, `.next`, `dist`).

---

## Phase 2 — Fan out by attack surface

Delegate to **`Explore` subagents, 3 concurrent**, each owning one non-overlapping
surface and returning findings in the template below. The threat surfaces, mapped to
where Orbit's risk actually concentrates:

| Surface | Where to look | Checklist sections |
|---|---|---|
| AuthZ & data-isolation | `orbit-api` controllers + CQRS handlers — every handler must scope its query by the authenticated `userId` | A |
| **AI / MCP tool scoping** | the agent/MCP tool handlers in `orbit-api` (the `*_agent_operation_v2`, `bulk_*`, and per-entity mutators the Orbit MCP exposes) — confirm each resolves the caller's `userId` and cannot touch another user's rows | A, F |
| Injection | raw/interpolated SQL or EF, `dangerouslySetInnerHTML`, `Process.Start`, path building from user input | B |
| Secrets & config | hardcoded keys/JWT secrets/connection strings; `.env`-shaped values in source; debug flags; security headers/CORS in `Program.cs` | C, D |
| Rate-limit & AI-abuse | coverage on auth, password-reset, and the AI/chat endpoints; request-size limits; prompt-injection / unbounded-cost paths in the AI flow | E, F |
| Error leakage & web auth | stack traces / DB schema in responses; cookie flags (httpOnly+strict+secure); mobile token storage (SecureStore, never AsyncStorage) | G, H |

Each subagent prompt embeds:

> **Objective**: audit `<surface>` in `<repo>` against `checklist.md` sections <list>.
> **Read the checklist first.** For every issue emit the finding template with an exact
> `file:line`, a tier (1/2/3), the **threat** (who reaches it and what they get), and a
> concrete **fix**. Prove cross-user-access risk by showing the query is *not* scoped to
> the caller's userId (cite the line). Skip Tier-3 enterprise controls — note them once.
> Findings only, no padding.

---

## Phase 3 — The Orbit-specific must-checks (do not skip)

These are where a habit tracker with AI tools and billing actually bleeds — verify each
explicitly even if a subagent didn't surface it:

1. **Every data query is user-scoped.** Each orbit-api query/command handler filters by
   the authenticated `userId` (from the JWT, never from a request field the client
   controls). A handler that takes an `id` and loads it without an ownership check is a
   **Tier 1 IDOR** — another user reads/writes your habits.
2. **AI / MCP tools cannot cross users.** The agent operations (`execute_agent_operation_v2`,
   `bulk_delete_habits`, `bulk_log_habits`, `delete_goal`, `manage_account`, …) run
   *on behalf of* the authenticated user. Confirm the tool layer derives `userId` from the
   session and that no tool accepts a target-user parameter. A tool that mutates by raw id
   without ownership scoping is **Tier 1**.
3. **AI-abuse / prompt-injection.** User text reaches the model. Check: is the AI endpoint
   rate-limited and size-capped (chat 20MB / Kestrel 10MB per the rubric)? Can a crafted
   prompt make a tool act outside the user's own data, or run an unbounded-cost loop? The
   model output must not be trusted to *authorize* — authorization stays server-side.
4. **`[Authorize]` by default.** Every new controller endpoint requires JWT Bearer unless
   it is `/health` or `/api/auth/*`. An endpoint with neither `[Authorize]` nor an explicit
   `[AllowAnonymous]` is a **Tier 1** hole.
5. **Payment & webhook integrity.** Stripe/Play webhook handlers verify their signature
   (`WebhookSecret`); the Stripe key is set globally in `Program.cs`, never per-request.
   An unverified webhook = forged subscription state (**Tier 1**).
6. **Secrets never in source.** No JWT secret, DB password, OpenAI/Stripe/Play key, or
   VAPID private key committed. Config comes from env. A committed secret is **Tier 1**.
7. **Boundary flags intact.** Web auth cookie httpOnly + sameSite strict + secure always;
   mobile tokens in SecureStore (never AsyncStorage); CORS not `AllowAnyOrigin()` with
   `AllowCredentials()`; security-headers middleware not disabled.

---

## Phase 4 — Report

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/security-{scope}.md`

```markdown
# Security Audit: {SCOPE}

**Scope**: {both repos / repo / path}
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
- **Guess at unscoped queries.** Cite the exact line where the `userId` filter is missing.
- **Remediate during the audit.** Findings first; fix only if the user asks after.
- **Audit generated / vendored code** (`Migrations/`, `design/handoff/`, `node_modules`).

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
