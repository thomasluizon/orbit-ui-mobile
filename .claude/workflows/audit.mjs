export const meta = {
  name: 'audit',
  description: 'Repo-wide audit engine — Haiku fan-out per surface + Haiku adversarial verify + loop-until-dry; returns verified findings for Opus synthesis. Kind: security | tests | performance | code-quality.',
  phases: [
    { title: 'Find', detail: 'one Haiku finder per surface, scoped by kind' },
    { title: 'Verify', detail: 'one Haiku skeptic per serious finding — default refuted' },
    { title: 'Complete', detail: 'completeness critic + gap finders, loop until dry' },
  ],
}

const UI = 'C:\\Users\\thoma\\Documents\\Programming\\Projects\\orbit-ui-mobile'
const API = 'C:\\Users\\thoma\\Documents\\Programming\\Projects\\orbit-api'
const VERIFY_CAP = 60
const HARD_ROUNDS = 4

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string' },
          title: { type: 'string' },
          category: { type: 'string' },
          location: { type: 'string' },
          evidence: { type: 'string' },
          rationale: { type: 'string' },
          fix: { type: 'string' },
          reference: { type: 'string' },
        },
        required: ['severity', 'title', 'location', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },
    note: { type: 'string' },
    adjustedSeverity: { type: 'string' },
  },
  required: ['refuted', 'note'],
}

const CRITIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          prompt: { type: 'string' },
        },
        required: ['label', 'prompt'],
      },
    },
  },
  required: ['gaps'],
}

const KIND = {
  security: {
    ladder: 'Tier 1 (must fix — exploitable now, real blast radius) / Tier 2 (should fix before launch) / Tier 3 (enterprise — OUT of scope, mention once)',
    rationale: 'threat — who reaches it (other user / anon / forged webhook / crafted prompt) and what they get',
    checklist: `${UI}\\.claude\\skills\\audit-security\\checklist.md`,
    extra: 'For cross-user access, PROVE the query is NOT scoped to the caller userId by citing the exact line. Payment/webhook handlers: verify the signature check exists. Secrets: cite the committed line. AI/MCP tools must derive userId from the session and accept no target-user parameter.',
    surfaces: [
      { label: 'authz-isolation', repos: 'both', where: 'orbit-api controllers + every CQRS query/command handler in src/Orbit.Application — each must scope its query by the authenticated userId (from the JWT, never a client-controlled field)', sections: 'A' },
      { label: 'ai-mcp-scoping', repos: 'api', where: 'the agent/MCP tool handlers in orbit-api (execute_agent_operation_v2, bulk_delete_habits, bulk_log_habits, delete_goal, manage_account, and the per-entity mutators) — each must resolve the caller userId and cannot touch another user rows', sections: 'A, F' },
      { label: 'injection', repos: 'both', where: 'raw or interpolated SQL/EF, dangerouslySetInnerHTML (web), Process.Start, path building from user input', sections: 'B' },
      { label: 'secrets-config', repos: 'both', where: 'hardcoded keys / JWT secrets / connection strings, .env-shaped values in source, debug flags, security headers + CORS in Program.cs and the Extensions', sections: 'C, D' },
      { label: 'ratelimit-ai-abuse', repos: 'both', where: 'rate-limit coverage on auth (send-code / verify-code), password-reset, and the AI/chat endpoints; request-size limits; prompt-injection and unbounded-cost paths in the AI flow', sections: 'E, F' },
      { label: 'error-web-auth', repos: 'both', where: 'stack traces / DB schema leaked in API responses; web auth cookie flags (httpOnly + sameSite strict + secure); mobile token storage (SecureStore, never AsyncStorage)', sections: 'G, H' },
    ],
  },
  tests: {
    ladder: 'Critical (untested critical path) / High (happy-path-only or rubber-stamp on a critical path) / Medium (missing edge/failure off the critical path)',
    rationale: 'what a real behavior break this test would NOT catch',
    checklist: `${UI}\\.claude\\skills\\audit-tests\\rubric.md`,
    extra: 'Judge tests by what they would FAIL on, never by count/coverage. For each test decide if it covers a critical path (auth, billing/subscription, AI/MCP tools, data-isolation, timezone/dates, validation) and score Behavior/Edge/Failure. Flag happy-path-only, rubber-stamp (asserts a mock was called / tautological / assertion-free), over-mocked (the unit never runs), implementation-coupled (asserts private state or call order). For each gap SPECIFY the CONCRETE missing test as text in the fix field (never write it to disk) — name + arrange/act/assert + the real factory from packages/shared/src/__tests__/factories.ts. Unit-tests-only policy: flag any integration/E2E/real-DB harness as out-of-policy, do not reward it.',
    surfaces: [
      { label: 'web', where: 'apps/web tests (Vitest) — auth flow, pay-gating, any user-facing critical path', sections: '' },
      { label: 'mobile', where: 'apps/mobile tests (Vitest) — auth flow, Play billing verify, critical paths', sections: '' },
      { label: 'shared', where: 'packages/shared tests (Vitest __tests__) — Zod schemas, domain-ish helpers, factories', sections: '' },
      { label: 'api-application', where: 'orbit-api tests/Orbit.Application.Tests — commands, queries, validators, AI/agent operation handlers, data-isolation', sections: '' },
      { label: 'api-domain', where: 'orbit-api tests/Orbit.Domain.Tests + Orbit.Infrastructure.Tests — factory guards, domain logic, timezone/date logic', sections: '' },
    ],
  },
  performance: {
    ladder: 'High (degrades with scale — fix before it bites) / Medium (measurable but bounded) / Low or Info (micro, or only-at-enterprise-scale — noted, not prioritized)',
    rationale: 'impact — how it scales, concrete (e.g. "50-habit user → 50 round-trips")',
    checklist: `${UI}\\.claude\\skills\\audit-performance\\SKILL.md`,
    extra: 'Flag ONLY patterns that degrade quadratically/linearly with data or traffic: N+1 queries (missing .Include / projecting after materializing), missing index on a hot Where/OrderBy/FK, unbounded list rendered in full, sync slow work (HTTP/AI/email/push) inline in a request path, blocking async (.Result/.Wait), IQueryable materialized too early, missing AsNoTracking on hot reads; frontend render thrash, bundle bloat, over-eager or stale caching, waterfalls. CONFIRM every index claim against the EF migrations (read them, cite the migration). Do NOT micro-optimize, do NOT over-prescribe memoization/virtualization, do NOT list enterprise-only tuning (note once).',
    surfaces: [
      { label: 'api-queries', where: 'orbit-api CQRS query handlers in src/Orbit.Application/**/Queries, the generic repository, EF DbContext usage — N+1 and index coverage (read src/Orbit.Infrastructure/Migrations to confirm indexes)', sections: '' },
      { label: 'api-requestpath', where: 'orbit-api controllers + command handlers — sync slow work in the request path, blocking async, over-fetching, missing AsNoTracking', sections: '' },
      { label: 'fe-web', where: 'apps/web — TanStack Query hooks (staleTime/gcTime/invalidation), render thrash on hot subtrees, next.config bundle surface, heavy client components', sections: '' },
      { label: 'fe-mobile', where: 'apps/mobile — long lists (FlatList vs .map), Metro bundle, query caching, image/asset weight for the 412px shell', sections: '' },
    ],
  },
  'code-quality': {
    ladder: 'Critical / High / Medium / Low / Info (a deep audit KEEPS Low/Info — the sanctioned rubric exception — but bucket them separately)',
    rationale: 'the rubric dimension it breaks and why it is real debt',
    checklist: `${UI}\\.claude\\skills\\pr-review\\rubric.md`,
    extra: 'Hunt dead/stale code and PROVE each with a zero-reference grep (cite the command and its empty result — never guess). Flag SOLID/clean-arch (functions over the ~50-line soft cap / ~100 hard cap, nesting past ~3), premature abstraction, DRY-at-the-wrong-level, comment-policy breaks (fix is rename-the-symbol or extract, never reword), naming (data/info/temp/helper/util as final names, abbreviations), and DESIGN.md drift on apps/* UI files only. Rank by blast-radius × churn — a smell in a hot handler outranks the same in a stable leaf. Do NOT re-derive security/contract findings (owned by /audit-security and /pr-review).',
    surfaces: [
      { label: 'web', where: 'apps/web/ — dimensions 2,3,4,6,7,8,9,10', sections: '' },
      { label: 'mobile', where: 'apps/mobile/ — dimensions 2,3,4,6,7,8,9,10', sections: '' },
      { label: 'shared', where: 'packages/shared/ — dimensions 2,3,4,6,9,10,11', sections: '' },
      { label: 'api-application', where: 'orbit-api/src/Orbit.Application/ — dimensions 2,3,4,5,6,13', sections: '' },
      { label: 'api-core', where: 'orbit-api/src/{Orbit.Domain,Orbit.Infrastructure,Orbit.Api}/ — dimensions 2,3,4,6,13', sections: '' },
    ],
  },
}

const EXCLUDE = 'Exclude generated/vendored dirs (node_modules, .next, dist, build, bin, obj, coverage, .turbo, Migrations/ except when reading them to confirm an index, design/handoff/).'

const isApiSurface = (s) => s.label.startsWith('api-') || /orbit-api/.test(s.where)
const surfaceRepos = (s) => s.repos || (isApiSurface(s) ? 'api' : 'ui')

function scopeLabelFor(scope) {
  if (!scope || scope === 'both') return 'both repos'
  if (['ui', 'web', 'mobile', 'frontend'].includes(scope)) return 'orbit-ui-mobile'
  if (['api', 'backend'].includes(scope)) return 'orbit-api'
  return scope
}

function resolveSurfaces(kind, scope) {
  const all = KIND[kind].surfaces
  if (!scope || scope === 'both') return all
  if (['api', 'backend'].includes(scope)) return all.filter((s) => ['api', 'both'].includes(surfaceRepos(s)))
  if (['ui', 'web', 'mobile', 'frontend'].includes(scope)) return all.filter((s) => ['ui', 'both'].includes(surfaceRepos(s)))
  return all.map((s) => ({ ...s, where: `${s.where} — but ONLY within the path "${scope}"` }))
}

function finderPrompt(kind, surface, scope) {
  const cfg = KIND[kind]
  const sectionNote = surface.sections ? ` (sections ${surface.sections})` : ''
  return [
    `Objective: ${kind} audit of the "${surface.label}" surface in ${scopeLabelFor(scope)}.`,
    `Read the rubric/checklist FIRST: ${cfg.checklist}${sectionNote}. It is the contract for what counts and how findings are shaped.`,
    `Where to look: ${surface.where}.`,
    `Repo roots — orbit-ui-mobile: ${UI} · orbit-api: ${API}.`,
    cfg.extra,
    `For every REAL issue emit a finding with: severity from [${cfg.ladder}]; a one-line title; category (the rubric/checklist dimension); location (repo-relative path:line); evidence (the exact line/command that proves it); rationale (${cfg.rationale}); fix (the concrete change); reference (the CLAUDE.md rule / rubric dimension / checklist section / OWASP item).`,
    `Calibrate to Orbit's solo-dev, pre-scale reality — never inflate severity to look thorough; when uncertain, pick the lower tier with a "verify" note. ${EXCLUDE} Findings only, no padding. If the surface is clean, return an empty findings array.`,
  ].join('\n')
}

function skepticPrompt(kind, f) {
  return [
    `Adversarially REFUTE this ${kind} finding. Read the cited location in full context and argue it is a FALSE POSITIVE — the path is unreachable, the query IS userId-scoped, the input is already validated, the index exists (cite the migration), the test WOULD fail on a real break, it is a duplicate, or the severity is inflated.`,
    `Default to refuted=true when uncertain — the burden is on the finding to prove it is real, not on you to prove it isn't.`,
    `Finding: severity=${f.severity} · title=${f.title} · location=${f.location} · evidence=${f.evidence} · rationale=${f.rationale || ''}.`,
    `Return refuted (bool) + note (one line why). If it is real but over-rated, set adjustedSeverity to the correct lower label.`,
  ].join('\n')
}

function criticPrompt(kind, scope, sweptLabels, count) {
  return [
    `Completeness critic for the ${kind} audit of ${scopeLabelFor(scope)}.`,
    `Surfaces swept so far: ${sweptLabels.join(', ')} — producing ${count} findings.`,
    `What did this audit NOT examine — a surface never swept, a file/handler/route skipped, or a claim left unverified (a dead-code grep not run, a userId scope unchecked, an index-in-migration unconfirmed, a critical-path test unmapped)?`,
    `Stay strictly within this audit's calibration — ${KIND[kind].ladder}. Do NOT propose gaps outside the in-scope tiers (for security, enterprise/Tier-3 controls — GDPR/SOC2, dependency-CVE scanning, SIEM/attack-monitoring — are deliberately out of scope; for tests, coverage-percentage). Propose at most 6 gaps, highest-value first.`,
    `Return gaps as {label, prompt}, where prompt is a ready-to-run finder objective for that gap (same finding shape as the finders). Return an EMPTY gaps array if coverage is genuinely complete — do not invent gaps.`,
  ].join('\n')
}

const rank = (s) => {
  const x = (s || '').toLowerCase()
  if (x.includes('critical') || x.includes('tier 1')) return 0
  if (x.includes('high') || x.includes('tier 2')) return 1
  if (x.includes('medium')) return 2
  return 3
}
const keyOf = (f) => `${(f.location || '').toLowerCase().trim()}::${(f.title || '').toLowerCase().trim().slice(0, 60)}`
const countBy = (findings) => {
  const out = {}
  for (const f of findings) {
    const s = (f.severity || 'unknown').trim()
    out[s] = (out[s] || 0) + 1
  }
  return out
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const kind = parsedArgs.kind
const scope = parsedArgs.scope || 'both'
if (!KIND[kind]) throw new Error(`audit workflow: unknown kind "${kind}" (expected security | tests | performance | code-quality)`)
const cfg = KIND[kind]
const isSerious = (f) => rank(f.severity) <= 1

const seen = new Set()
const dedupeFresh = (findings) => {
  const fresh = []
  for (const f of findings) {
    const k = keyOf(f)
    if (seen.has(k)) continue
    seen.add(k)
    fresh.push(f)
  }
  return fresh
}

phase('Find')
const surfaces = resolveSurfaces(kind, scope)
log(`audit:${kind} · scope ${scopeLabelFor(scope)} · ${surfaces.length} surfaces`)
const firstPass = (
  await parallel(
    surfaces.map((s) => () =>
      agent(finderPrompt(kind, s, scope), { label: `find:${s.label}`, phase: 'Find', model: 'haiku', agentType: 'audit-readonly', schema: FINDINGS_SCHEMA })
    )
  )
).filter(Boolean)
const sweptLabels = surfaces.map((s) => s.label)
let findings = dedupeFresh(firstPass.flatMap((r) => r.findings || []))

async function verifySerious(candidates, phaseName) {
  const serious = candidates.filter(isSerious).sort((a, b) => rank(a.severity) - rank(b.severity))
  const now = serious.slice(0, VERIFY_CAP)
  const capped = serious.slice(VERIFY_CAP)
  const verdicts = (
    await parallel(
      now.map((f, i) => () =>
        agent(skepticPrompt(kind, f), { label: `verify:${(f.location || String(i)).slice(0, 40)}`, phase: phaseName, model: 'haiku', agentType: 'audit-readonly', schema: VERDICT_SCHEMA }).then((v) => ({ f, v }))
      )
    )
  ).filter(Boolean)
  const survivors = []
  for (const { f, v } of verdicts) {
    if (v && v.refuted) continue
    if (v && v.adjustedSeverity) f.severity = v.adjustedSeverity
    survivors.push(f)
  }
  const passthrough = candidates.filter((f) => !isSerious(f))
  return { kept: [...survivors, ...passthrough], capped }
}

phase('Verify')
let { kept, capped } = await verifySerious(findings, 'Verify')
const deferred = capped.map((f) => ({ title: f.title, location: f.location, severity: f.severity, deferReason: 'exceeded the adversarial-verify cap — shipped unchallenged, re-verify before acting' }))
log(`verified: ${kept.length} kept · ${capped.length} deferred (cap)`)

phase('Complete')
let round = 0
let dry = 0
let criticErrors = 0
let convergenceReason = ''
const maxDry = parsedArgs.loop?.maxDryRounds ?? 2
const MAX_CRITIC_ERRORS = 2
while (dry < maxDry && round < HARD_ROUNDS) {
  round += 1
  const critic = await agent(criticPrompt(kind, scope, sweptLabels, kept.length), { label: `critic:round-${round}`, phase: 'Complete', model: 'haiku', agentType: 'audit-readonly', schema: CRITIC_SCHEMA })
  if (!critic) {
    criticErrors += 1
    log(`round ${round}: critic DIED (${criticErrors}/${MAX_CRITIC_ERRORS}) — a dead verifier is UNKNOWN, not a clean pass; not counting as dry`)
    if (criticErrors >= MAX_CRITIC_ERRORS) {
      convergenceReason = `critic died ${criticErrors}× (rate-limit or API error) — completeness UNKNOWN`
      break
    }
    continue
  }
  const gaps = critic.gaps || []
  if (!gaps.length) {
    dry += 1
    continue
  }
  const roundResults = await parallel(
    gaps.map((g) => () =>
      agent(g.prompt, { label: `find:${g.label}`, phase: 'Complete', model: 'haiku', agentType: 'audit-readonly', schema: FINDINGS_SCHEMA })
    )
  )
  const finderDied = roundResults.some((r) => !r)
  const roundRaw = roundResults.filter(Boolean).flatMap((r) => r.findings || [])
  gaps.forEach((g) => sweptLabels.push(g.label))
  const fresh = dedupeFresh(roundRaw)
  if (!fresh.length) {
    if (finderDied) {
      log(`round ${round}: a gap-finder died and no fresh findings surfaced — absence is UNPROVEN, not counting as dry`)
      continue
    }
    dry += 1
    continue
  }
  dry = 0
  const { kept: freshKept, capped: freshCapped } = await verifySerious(fresh, 'Complete')
  kept = kept.concat(freshKept)
  freshCapped.forEach((f) => deferred.push({ title: f.title, location: f.location, severity: f.severity, deferReason: 'exceeded the adversarial-verify cap — shipped unchallenged, re-verify before acting' }))
  log(`round ${round}: +${fresh.length} fresh (${freshKept.length} kept)`)
}

const converged = dry >= maxDry
if (!convergenceReason) {
  convergenceReason = converged
    ? `${dry} consecutive executed-empty critic round(s)`
    : `stopped at the ${HARD_ROUNDS}-round hard cap without ${maxDry} executed-empty rounds`
}

const budgetSnapshot =
  typeof budget !== 'undefined' && budget
    ? { spent: budget.spent(), remaining: budget.remaining(), total: budget.total }
    : null

kept.sort((a, b) => rank(a.severity) - rank(b.severity))
return {
  kind,
  scope,
  scopeLabel: scopeLabelFor(scope),
  findings: kept,
  counts: countBy(kept),
  coverage: sweptLabels,
  deferred,
  rounds: round,
  converged,
  convergenceReason,
  criticErrors,
  tokenBudget: budgetSnapshot,
  loopBound: round >= HARD_ROUNDS ? `stopped at the ${HARD_ROUNDS}-round hard cap` : `${dry} consecutive dry round(s)`,
}
