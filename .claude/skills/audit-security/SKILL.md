---
name: audit-security
description: Repo-wide security audit across both Orbit repos (orbit-ui-mobile + orbit-api), opening one Linear ticket per verified risk after a human approval gate (D10). Checks judgement-level authz / data-isolation (incl. AI & MCP tool scoping), injection, secrets handling, CORS, rate-limit coverage, AI-abuse, and error leakage, EXCLUDING everything the gates already enforce (D11). Each finding carries severity, file:line evidence, threat model, and remediation, calibrated to Tier 1+2 (Tier 3 out-of-scope). Use when the user asks for a security audit, threat review, or pre-launch hardening pass.
argument-hint: <path | repo | blank=both repos>
---

# Audit Security

**Input**: $ARGUMENTS

Run a repo-wide security audit across **both** Orbit repos and open one Linear ticket
per verified risk (D10), each pinned to a file:line, with the threat it enables and the
fix that closes it. The output is executable tickets behind one approval gate, never a
report that rots the day after it is written.

The fan-out, the adversarial verify, and the loop-until-dry run as the **`audit`
dynamic workflow** (`.claude/workflows/audit.mjs`), **Haiku finders + Haiku skeptics**,
deterministic orchestration, so Opus spends tokens only on **this synthesis**.

**Golden rule**: every finding is a *concrete, exploitable-or-not* claim tied to a
file:line and a threat, calibrated to Orbit's actual scale. No theater, a finding either
names how an attacker (or a buggy client, or another user) reaches it, or it isn't a
finding. **Right-size to the tiers below**; do not paste enterprise checklists a solo,
pre-scale app will never hit.

---

## Phase 0: Provenance, tiers & self-containment

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
per **Phase 2's fallback**, the audit still completes against the same checkout.

### Severity tiers: calibrate every finding

Orbit is a **solo-dev, pre-full-scale** habit tracker with real users and **live billing**
+ **AI agent tools that mutate user data**. Audit to Tier 1 + Tier 2; mark Tier 3
explicitly out-of-scope so the approval gate stays decision-ready, not a fear list.

| Tier | What it covers | In this audit? |
|---|---|---|
| **Tier 1, Must fix** | Cross-user data access, auth bypass, secret leakage, injection, an AI/MCP tool that mutates another user's data, payment/webhook forgery. Exploitable now, real blast radius. | **Yes, block on these.** |
| **Tier 2, Should fix** | Missing rate-limit on an abusable/expensive route (auth, AI), verbose error leakage, defense-in-depth gaps, missing input validation at a boundary, permissive CORS that isn't yet exploitable. | **Yes, fix before/at launch.** |
| **Tier 3, Enterprise / not-yet** | WAF, SIEM, pen-test cadence, secrets-vault rotation, DDoS scrubbing, SOC2 controls, threat-intel feeds. Real at scale, noise for a solo pre-launch app. | **No, list as "out of scope (Tier 3)" and move on.** |

When old-client reach or real-world exploitability is uncertain, say so and pick the
lower tier with a "verify" note, never inflate to Tier 1 to look thorough.

### D11 scope: judgement only, never what a gate checks

Read **`.claude/skills/_shared/gate-owned-exclusions.md`**. This audit looks ONLY for what
no gate can see. It does NOT re-flag: a controller missing `[Authorize]` (Roslyn `ORBIT0003`
owns that), committed-secret shapes (GitGuardian owns those), or any ESLint `local/*` /
`guards.yml` concern. It DOES own the judgement half, enumerated as Phase 3's must-checks.
Presence is gated; correctness is the audit.

---

## Phase 1: Resolve scope

Parse `$ARGUMENTS` into a `{scope}` token to pass to the workflow: blank → `both`;
`api`/`backend` → `api`; `frontend`/`web`/`mobile` → `ui`; a path → the path itself.

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

Load **`.claude/skills/_shared/verification-protocol.md`** (the reliability contract: the
workflow *executes* the coverage contract §1, adversarial verify §2, and loop-until-dry §3;
you carry the Verify summary + Deferred ledger §4/§5 into the approval gate) and
**`.claude/skills/_shared/audit-to-tickets.md`** (the D10 ticket-emission pipeline this
skill's Phase 4 runs).

---

## Phase 2: Run the audit workflow (Haiku fan-out + adversarial verify)

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/audit.mjs', args: { kind: 'security', scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical, named workflow resolution is not available in this Claude Code build.)

It fans out **one Haiku finder per attack surface**, authz & data-isolation · AI/MCP tool
scoping · injection · secrets & config · rate-limit & AI-abuse · error-leakage & web/mobile
auth, each reading `checklist.md`; runs a **Haiku adversarial skeptic** per **Tier-1/Tier-2**
finding (default-refuted); runs a **completeness critic** and loops until dry (cap 2 dry
rounds). It returns:

```
{ findings: [{ severity, title, category, location, evidence, rationale, fix, reference }],
  counts, coverage, deferred, rounds, converged, convergenceReason, loopBound, criticErrors, scopeLabel }
```

**Completeness is a computed field, not an assumption.** `converged === true` only after the
critic ran and returned empty. If `converged !== true` (e.g. `criticErrors ≥ 2` from a
rate-limit), the sweep did NOT prove completeness, report it as "coverage UNKNOWN -
${convergenceReason}", never as a clean/complete audit. A dead verifier is not a clean pass.

`rationale` carries the **threat**. The surfaces + the completeness critic together own the
Orbit-specific must-checks (Phase 3), if the returned `coverage` omits one, add it as a
gap and re-invoke the workflow with a narrowed scope.

**Fallback (no `Workflow` tool, headless/CI):** run the fan-out inline instead, spawn
`audit-readonly` finders (Haiku, 3 concurrent) over the six surfaces against `checklist.md`,
then Haiku skeptics per Tier-1/2 finding, then a completeness pass, exactly the workflow's
phases, per verification-protocol §2/§3. Same findings shape. The fallback keeps the primary
path's agent type on purpose: `audit-readonly` has no write, edit, or shell tools, so a
missing `Workflow` tool can never widen a read-only audit's tool surface.

---

## Phase 3: The Orbit-specific must-checks (the workflow encodes these; confirm the return covers them)

These are where a habit tracker with AI tools and billing actually bleeds. The workflow's
surfaces target each; **confirm the returned findings/coverage address every one**, and
re-invoke for any gap:

1. **Every data query is user-scoped**, each orbit-api handler filters by the JWT `userId`,
   never a client field. An `id` loaded without an ownership check is a **Tier 1 IDOR**.
2. **AI / MCP tools cannot cross users**, the agent operations derive `userId` from the
   session; no tool accepts a target-user parameter. A raw-id mutator is **Tier 1**.
3. **AI-abuse / prompt-injection**, the AI endpoint is rate-limited + size-capped; a crafted
   prompt cannot make a tool act outside the user's data or run an unbounded-cost loop; model
   output never *authorizes*.
4. **`[Authorize]` covers the right identity.** The attribute's PRESENCE is gated by Roslyn
   `ORBIT0003` (not an audit finding). In scope: an endpoint that authenticates but then acts
   on a client-supplied id without an ownership check, or an over-broad `[AllowAnonymous]`.
5. **Payment & webhook integrity.** Stripe/Play webhooks verify their signature; the Stripe
   key is set globally, never per-request. Unverified webhook = **Tier 1**.
6. **Secrets handled safely.** Committed-secret SHAPES are gated by GitGuardian (not an audit
   finding). In scope: a key read per-request instead of set globally, a secret logged or
   returned in an error, or a token in the wrong store (mobile AsyncStorage vs SecureStore).
7. **Boundary flags intact**, web cookie httpOnly+strict+secure; mobile tokens in SecureStore;
   CORS not `AllowAnyOrigin()` with `AllowCredentials()`; security-headers middleware live.

---

## Phase 4: Emit tickets (D10), not a report

Run the shared pipeline in **`.claude/skills/_shared/audit-to-tickets.md`**: one Linear
ticket per verified finding, drafted to the 6.2 template, validated by
`node tools/check-ticket.mjs --file`, presented to Thomas behind ONE approval gate, then
created via `orca linear create` and re-validated with `--issue`.

Security-specific mapping into the 6.2 body:

- **Problem / why it matters** carries the tier and the **threat** (`rationale`): who reaches
  it (other user / anon / forged webhook / crafted prompt) and what they get. A Tier-1 IDOR
  and a Tier-2 missing rate limit are different tickets, never one.
- **Technical details** carries the `evidence` line (e.g. "query loads habit by id with no
  userId filter") and the `reference` (CLAUDE.md security boundary / orbit-api hard rule /
  OWASP A0x / checklist section).
- **Out of scope** names the Tier-3 controls deliberately deferred (WAF, SIEM, vault rotation)
  and the gate-owned half where relevant (`ORBIT0003` presence, GitGuardian shapes).
- `repo:*` comes from `location`; an api-side fix that a ui change depends on is the api
  ticket that BLOCKS the ui ticket.

At the approval gate, present the surface **coverage** (authz-isolation, ai-mcp-scoping,
injection, secrets-config, ratelimit-ai-abuse, error-web-auth), the **Deferred ledger** (the
workflow's `deferred`: verify-cap overflow, loop bound, plus Tier-3), and the convergence
state (`coverage UNKNOWN, <convergenceReason>` if `converged !== true`) so Thomas approves
with the full provenance in view. None of it is written to disk.

---

## Guardrails: do NOT

- **Re-run the workflow's analysis.** It owns the fan-out, the skeptic pass, and the loop;
  you turn its return into tickets. Only re-invoke for a coverage gap.
- **Write a report file, or create tickets unattended.** The output is Linear tickets behind
  the one approval gate; nothing is persisted to `.claude/audits/` and nothing is created
  before Thomas approves.
- **Remediate during the audit.** Tickets first; fix only if the user asks after.

---

## Output

```markdown
## Audit Complete: Security

**Scope**: {what was audited}
**Posture**: {1-line verdict, e.g. "No cross-user holes; 1 AI endpoint missing a rate limit"}

| Tier | Findings | Tickets |
|---|---|---|
| Tier 1 (must fix) | {N} | {created / pending approval} |
| Tier 2 (should fix) | {N} | {…} |
| Tier 3 (out of scope) | {acknowledged, not counted} | {none} |

**Tickets**: {the final ORB-N table, identifier · title · repo · blockedBy, or "clean: no judgement-level findings; the mechanical layer is gate-owned"}
**Top risk**: {the single highest-priority ticket, or "no Tier-1 findings"}
```
