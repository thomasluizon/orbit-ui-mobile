export const meta = {
  name: 'prod-readiness',
  description: 'Pre-launch orchestrator that runs the four audit workflows in parallel (Haiku fan-out), adds the ops-layer and static-a11y audits no child covers (D11 judgement no gate checks), verifies its own findings, and returns consolidated data for Opus to tier-tag, verdict, and turn into GitHub tickets (D10).',
  phases: [
    { title: 'Audits', detail: 'the four /audit workflows in parallel' },
    { title: 'Ops', detail: 'observability · multi-instance · background durability · staging' },
    { title: 'A11y', detail: 'static WCAG 2.2 AA sweep — web + mobile' },
    { title: 'Verify', detail: 'skeptic per Blocker/High ops or a11y finding — default refuted' },
  ],
}

const UI = 'C:\\Users\\thoma\\Documents\\Programming\\Projects\\orbit-ui-mobile'
const API = 'C:\\Users\\thoma\\Documents\\Programming\\Projects\\orbit-api'

const OPS_SCHEMA = {
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
          check: { type: 'string' },
          title: { type: 'string' },
          location: { type: 'string' },
          risk: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'check', 'title', 'risk', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const OPS_VERDICT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },
    note: { type: 'string' },
    adjustedSeverity: { type: 'string' },
  },
  required: ['refuted', 'note'],
}

const OPS_LADDER = 'Blocker (a whole runtime is dark, or it corrupts user data on scale-out) / High (a single observability gap, a scheduler that double-fires, work lost on restart) / Medium (calibrated — e.g. a missing pre-prod gate)'

const OPS_CHECKS = [
  {
    check: 'observability',
    where: `Sentry across all three runtimes — web ${UI}\\apps\\web\\sentry.server.config.ts + sentry.edge.config.ts + lib\\sentry-scrub.ts; mobile ${UI}\\apps\\mobile\\lib\\sentry-init.ts + lib\\sentry.ts; api ${API}\\src\\Orbit.Infrastructure\\Configuration\\SentrySettings.cs + ${API}\\src\\Orbit.Api\\Middleware\\UnhandledExceptionHandler.cs. Health: ${API}\\src\\Orbit.Infrastructure\\Services\\BackgroundServiceHealthCheck.cs + the MapHealthChecks registration. Alert routing: the Discord sink.`,
    ready: 'error capture initialized + DSN wired on all three surfaces, an unhandled-exception handler, a /health endpoint, and alerts routed to a sink someone watches',
    gap: 'a surface with no error capture, no health endpoint, or no alert sink is a finding (Blocker if a whole runtime is dark, High for a single gap)',
  },
  {
    check: 'multi-instance',
    where: `IHostedService schedulers (${API}\\src\\Orbit.Infrastructure\\Services\\*SchedulerService.cs, Services\\Hosting\\ScheduledServiceBase.cs) vs Hangfire (${API}\\src\\Orbit.Infrastructure\\BackgroundJobs\\HangfireRecurringJobRegistrar.cs, IScheduledJob.cs); any in-memory cache / rate-limit / counter assumed authoritative; session-affinity assumptions`,
    ready: 'recurring work coordinated through Hangfire durable store (one run cluster-wide); no single-instance in-memory authority',
    gap: 'an IHostedService that double-fires on every replica, or an in-memory rate-limit/cache that breaks when a second instance starts (High; Blocker if it corrupts user data on scale-out)',
  },
  {
    check: 'background-durability',
    where: `Hangfire store config (${API}\\src\\Orbit.Infrastructure\\Configuration\\BackgroundJobSettings.cs, ${API}\\src\\Orbit.Api\\Extensions\\ServiceCollectionExtensions.BackgroundJobs.cs); fire-and-forget paths (RunBackgroundPostResponseWork, push/email dispatch)`,
    ready: 'jobs persisted to a durable store, survive a restart, are idempotent / retried',
    gap: 'in-process fire-and-forget work lost on restart or crash, or a non-idempotent recurring job that double-applies on retry (High)',
  },
  {
    check: 'staging',
    where: `deploy/CI workflows in BOTH repos — ${UI}\\.github\\workflows\\promote-prod.yml, smoke-prod.yml, test.yml; ${API}\\.github\\workflows\\*. Discover the real state per repo; do not hardcode a snapshot (the QA env was aborted per #211 and the workflow set drifts)`,
    ready: 'a pre-prod gate (smoke + promote) sits between merge and prod',
    gap: 'no staging/QA env or no pre-prod gate (Medium, calibrated)',
  },
]

const A11Y_LADDER = 'Blocker (an essential journey cannot complete by keyboard or with assistive technology) / High (a confirmed WCAG 2.2 A/AA failure on a core journey — auth, today, habit logging, settings, billing — or in a shared primitive every screen composes) / Medium (an A/AA failure off the core journeys, or a best-practice gap with concrete user impact)'

const A11Y_CHECKS = [
  {
    check: 'a11y-web',
    where: `${UI}\\apps\\web — shared primitives and shell first (components/, the app/(app) layout, dialogs, menus, toasts, forms), then the core journeys (auth, today, habit logging, settings, billing)`,
  },
  {
    check: 'a11y-mobile',
    where: `${UI}\\apps\\mobile — shared primitives and the navigation shell first (components/, sheets, dialogs, tab bar), then the same core journeys; judge React Native semantics (accessibilityRole / accessibilityLabel / accessibilityState, grouped children, focus after navigation)`,
  },
]

function a11yPrompt(c) {
  return [
    `Static accessibility sweep "${c.check}" for Orbit. The floor is WCAG 2.2 Level AA and the objective is accessible task completion, never a score. This is a source read: claim only what source can prove.`,
    `Where to look: ${c.where}.`,
    `Judge the a11y judgement no gate owns: native-element-first (a pressable div/View where a button belongs); every ARIA role or RN accessibility prop as a keyboard and focus contract the code must honour (a role added without its key handling or focus management); focus on open, trapped while open, returned on close for dialogs and menus; a localized label in both locales for icon-only controls; colour as the only signal; the 3:1 non-text contrast floor for icons, borders, and state indicators; hit targets under 44 grown by glyph instead of padding; and materially different UI states (empty, loading, validation-error, dialog, menu, toast) that lose semantics the populated state has.`,
    `Gate-owned, do NOT flag: anything the react-doctor.yml a11y rules already fail on, and anything ESLint local/* or the Design Token Guard owns. Runtime-only claims (200% zoom, screen-reader output, the route x state x viewport x input-mode matrix) are OUT of scope: the workflow defers them as a11y-runtime-matrix, so never emit a finding that needs the live DOM.`,
    `Severity ladder: [${A11Y_LADDER}]. For each finding return: severity, check ("${c.check}"), title, location (repo-relative path:line), risk (which user and which task is blocked, and how), evidence (the exact line that proves it), fix (the concrete change). Findings only; return an empty array if the surface is clean.`,
  ].join('\n')
}

function opsPrompt(c) {
  return [
    `Ops-readiness check "${c.check}" for the Orbit production system. This is NOT covered by any code/test/security/performance audit — it asks whether the RUNNING system survives production.`,
    `Where to look (discover the real state at runtime — these are pointers, not verdicts): ${c.where}.`,
    `"Ready" looks like: ${c.ready}.`,
    `Emit a finding only for a real gap: ${c.gap}.`,
    `Severity ladder: [${OPS_LADDER}]. Calibrate to Orbit's solo-dev, pre-scale reality — do NOT itemize SOC2 / SIEM / multi-region / DR drills (enterprise-only). For each finding return: severity, check ("${c.check}"), title, location (repo path:line, or "config/console — not in repo"), risk (what breaks in production and when), evidence (the line/config that proves it, or "not found at runtime"), fix (the concrete change). Findings only; return an empty array if the check is ready.`,
  ].join('\n')
}

const rank = (s) => {
  const x = (s || '').toLowerCase()
  if (x.includes('blocker') || x.includes('critical') || x.includes('tier 1')) return 0
  if (x.includes('high') || x.includes('tier 2')) return 1
  if (x.includes('medium')) return 2
  return 3
}
const isSerious = (f) => /blocker|high/i.test(f.severity || '')

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const scope = parsedArgs.scope || 'both'
const performanceMeasurement = parsedArgs.performanceMeasurement || {
  status: 'unavailable',
  reason: 'prod-readiness did not receive a production performance measurement',
}
const AUDIT_KINDS = ['security', 'tests', 'performance', 'code-quality']

phase('Audits')
log(`prod-readiness · scope ${scope} · running ${AUDIT_KINDS.length} audits + ops + a11y`)
const auditResults = (
  await parallel(AUDIT_KINDS.map((k) => () => workflow(
    { scriptPath: '.claude/workflows/audit.mjs' },
    { kind: k, scope, measurement: k === 'performance' ? performanceMeasurement : undefined },
  )))
).map((r, i) => r || { kind: AUDIT_KINDS[i], failed: true, findings: [], counts: {}, coverage: [], deferred: [] })

phase('Ops')
const opsRaw = (
  await parallel(
    OPS_CHECKS.map((c) => () =>
      agent(opsPrompt(c), { label: `ops:${c.check}`, phase: 'Ops', model: 'haiku', agentType: 'audit-readonly', schema: OPS_SCHEMA })
    )
  )
).filter(Boolean).flatMap((r) => r.findings || [])

phase('A11y')
const a11yRaw = (
  await parallel(
    A11Y_CHECKS.map((c) => () =>
      agent(a11yPrompt(c), { label: c.check, phase: 'A11y', model: 'haiku', agentType: 'audit-readonly', schema: OPS_SCHEMA })
    )
  )
).filter(Boolean).flatMap((r) => r.findings || [])

phase('Verify')
const REFUTE_FRAMING = {
  ops: 'ops-readiness finding. Read the cited config/code in full context and argue it is a FALSE POSITIVE — Hangfire already coordinates that job, the unhandled-exception handler DOES exist, the runtime really has a promote gate, the cache is per-request not process-global.',
  a11y: 'static-a11y finding. Read the cited component in full context and argue it is a FALSE POSITIVE — the control IS a native element further up the tree, the label DOES exist in both locales, the role carries its keyboard contract elsewhere, the state is not user-reachable, a react-doctor.yml rule already fails on it, or the severity is inflated.',
}
const verifyTargets = [
  ...opsRaw.filter(isSerious).map((f) => ({ f, layer: 'ops' })),
  ...a11yRaw.filter(isSerious).map((f) => ({ f, layer: 'a11y' })),
].sort((a, b) => rank(a.f.severity) - rank(b.f.severity))
const verdicts = (
  await parallel(
    verifyTargets.map(({ f, layer }) => () =>
      agent(
        [
          `Adversarially REFUTE this ${REFUTE_FRAMING[layer]}`,
          `Default to refuted=true when uncertain — the burden is on the finding.`,
          `Finding: severity=${f.severity} · check=${f.check} · title=${f.title} · location=${f.location || ''} · risk=${f.risk}.`,
          `Return refuted (bool) + note. If real but over-rated, set adjustedSeverity.`,
        ].join('\n'),
        { label: `verify:${f.check}`, phase: 'Verify', model: 'haiku', agentType: 'audit-readonly', schema: OPS_VERDICT }
      ).then((v) => ({ f, v, layer }))
    )
  )
).filter(Boolean)

const survivorsByLayer = { ops: [], a11y: [] }
for (const { f, v, layer } of verdicts) {
  if (v && v.refuted) continue
  if (v && v.adjustedSeverity) f.severity = v.adjustedSeverity
  survivorsByLayer[layer].push(f)
}
const opsFindings = [...survivorsByLayer.ops, ...opsRaw.filter((f) => !isSerious(f))]
  .sort((a, b) => rank(a.severity) - rank(b.severity))
const a11yFindings = [...survivorsByLayer.a11y, ...a11yRaw.filter((f) => !isSerious(f))]
  .sort((a, b) => rank(a.severity) - rank(b.severity))

return {
  scope,
  audits: auditResults,
  opsFindings,
  a11yFindings,
  opsChecksRun: OPS_CHECKS.map((c) => c.check),
  a11yChecksRun: A11Y_CHECKS.map((c) => c.check),
  opsDeferred: [
    { check: 'backups', reason: 'un-verifiable from a repo read — verify in the DB console: automated backups / PITR enabled AND a tested restore path' },
    { check: 'paid-api-cost-caps', reason: 'un-verifiable from a repo read: verify in each provider console (OpenAI, Resend, Stripe, FCM): a hard monthly cap AND a spend alert at 50% of it. An in-app rate limit bounds one caller, only the provider cap bounds the bill' },
    { check: 'a11y-runtime-matrix', reason: 'un-verifiable from a repo read — needs the running app: the axe A/AA tag set (wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa), a keyboard pass, and a screen-reader pass over the route x state x viewport x input-mode matrix; the static sweep claims source-provable findings only, never conformance' },
  ],
  failedAudits: auditResults.filter((r) => r.failed).map((r) => r.kind),
  unconvergedAudits: auditResults
    .filter((r) => !r.failed && r.converged !== true)
    .map((r) => ({ kind: r.kind, reason: r.convergenceReason || 'completeness unproven', criticErrors: r.criticErrors ?? null })),
  performanceMeasurement: auditResults.find((result) => result.kind === 'performance')?.performanceMeasurement || {
    status: 'unavailable',
    reason: 'performance audit did not return a measurement verdict',
  },
}
