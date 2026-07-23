export const meta = {
  name: 'prod-readiness',
  description: 'Pre-launch orchestrator — runs the four audit workflows in parallel (Haiku fan-out), adds the ops-layer audit no child covers, verifies its own ops findings, and returns consolidated data for Opus to tier-tag + verdict.',
  phases: [
    { title: 'Audits', detail: 'the four /audit workflows in parallel' },
    { title: 'Ops', detail: 'observability · multi-instance · background durability · staging' },
    { title: 'React', detail: 'react-doctor full-repo scan of orbit-ui-mobile (ui/both scope)' },
    { title: 'Verify', detail: 'skeptic per Blocker/High ops finding — default refuted' },
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

// React Doctor — the deterministic React-correctness gate (also a REQUIRED CI check,
// .github/workflows/react-doctor.yml). The CI gate is --scope changed (only NEW issues);
// prod-readiness runs the FULL-repo scan so the whole backlog is surfaced and fixed.
const REACT_DOCTOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ran: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string' },
          rule: { type: 'string' },
          category: { type: 'string' },
          location: { type: 'string' },
          message: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'rule', 'location', 'message'],
      },
    },
    note: { type: 'string' },
  },
  required: ['ran', 'findings'],
}

function reactDoctorPrompt() {
  return [
    `Run React Doctor over the WHOLE orbit-ui-mobile repo (apps/web + apps/mobile + packages/shared) and report EVERY diagnostic — this is the full backlog, NOT the PR-scoped CI gate.`,
    `Steps: cd to ${UI}. Ensure deps are present (node_modules exists; if not, run \`npm ci\`). Then run EXACTLY:`,
    `  npx -y react-doctor@0.7.6 --project apps/web,apps/mobile,packages/shared --json --json-out "${REACT_DOCTOR_JSON_OUT}" --no-supply-chain --no-score --no-dead-code --yes --max-duration 360 --no-color`,
    `(SCOPE the scan to the three real app workspaces via --project — this EXCLUDES design/handoff/**, whose vendored *.jsx design mockups emit ~1054 false jsx-no-undef "errors" that are NOT app code. --no-dead-code + --no-supply-chain + --no-score match the CI gate's hermetic/no-knip stance; do NOT drop them. Default scope is "full" and --warnings is on, so BOTH error- and warning-severity diagnostics are reported. Paths in the JSON are workspace-relative — prefix each with its project when reporting location.)`,
    `Read the JSON report file (${REACT_DOCTOR_JSON_OUT}). For EVERY diagnostic emit a finding: severity ("error" or "warning"), rule (the rule id), category (e.g. Correctness/Performance/Accessibility/Security), location ("apps/…/file.tsx:line"), message (what's wrong), fix (the concrete change — from the rule's guidance; run \`npx react-doctor@0.7.6 why <file:line>\` if you need the rationale).`,
    `Return ran=true with the full findings array — the report derives the error/warning counts from it, so do NOT report an aggregate of your own. This is READ-ONLY analysis — do NOT modify any source file. If react-doctor genuinely cannot run (offline, deps unresolved after npm ci), return ran=false, findings=[], and a one-line note.`,
  ].join('\n')
}

const { tmpdir } = await import('node:os')
const REACT_DOCTOR_JSON_OUT = `${tmpdir().replaceAll('\\', '/')}/rd-prodreadiness.json`

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
const isSeriousOps = (f) => /blocker|high/i.test(f.severity || '')
const countBy = (findings) => {
  const out = {}
  for (const f of findings) {
    const s = (f.severity || 'unknown').trim()
    out[s] = (out[s] || 0) + 1
  }
  return out
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const scope = parsedArgs.scope || 'both'
const AUDIT_KINDS = ['security', 'tests', 'performance', 'code-quality']

phase('Audits')
log(`prod-readiness · scope ${scope} · running ${AUDIT_KINDS.length} audits + ops`)
const auditResults = (
  await parallel(AUDIT_KINDS.map((k) => () => workflow({ scriptPath: '.claude/workflows/audit.mjs' }, { kind: k, scope })))
).map((r, i) => r || { kind: AUDIT_KINDS[i], failed: true, findings: [], counts: {}, coverage: [], deferred: [] })

phase('Ops')
const opsRaw = (
  await parallel(
    OPS_CHECKS.map((c) => () =>
      agent(opsPrompt(c), { label: `ops:${c.check}`, phase: 'Ops', model: 'haiku', agentType: 'audit-readonly', schema: OPS_SCHEMA })
    )
  )
).filter(Boolean).flatMap((r) => r.findings || [])

phase('React')
let reactDoctor = { ran: false, findings: [], note: 'skipped — react-doctor is orbit-ui-mobile-only (scope=api)' }
if (scope !== 'api') {
  reactDoctor =
    (await agent(reactDoctorPrompt(), {
      label: 'react-doctor',
      phase: 'React',
      agentType: 'general-purpose',
      model: 'sonnet',
      effort: 'medium',
      schema: REACT_DOCTOR_SCHEMA,
    })) || { ran: false, findings: [], note: 'react-doctor agent returned null (died/skipped) — treat as a Deferred coverage gap' }
}
const reactDoctorSeverities = countBy(reactDoctor.findings || [])
reactDoctor.errorCount = reactDoctorSeverities.error || 0
reactDoctor.warningCount = reactDoctorSeverities.warning || 0

phase('Verify')
const seriousOps = opsRaw.filter(isSeriousOps).sort((a, b) => rank(a.severity) - rank(b.severity))
const opsVerdicts = (
  await parallel(
    seriousOps.map((f) => () =>
      agent(
        [
          `Adversarially REFUTE this ops-readiness finding. Read the cited config/code in full context and argue it is a FALSE POSITIVE — Hangfire already coordinates that job, the unhandled-exception handler DOES exist, the runtime really has a promote gate, the cache is per-request not process-global.`,
          `Default to refuted=true when uncertain — the burden is on the finding.`,
          `Finding: severity=${f.severity} · check=${f.check} · title=${f.title} · location=${f.location || ''} · risk=${f.risk}.`,
          `Return refuted (bool) + note. If real but over-rated, set adjustedSeverity.`,
        ].join('\n'),
        { label: `verify:${f.check}`, phase: 'Verify', model: 'haiku', agentType: 'audit-readonly', schema: OPS_VERDICT }
      ).then((v) => ({ f, v }))
    )
  )
).filter(Boolean)

const opsFindings = []
for (const { f, v } of opsVerdicts) {
  if (v && v.refuted) continue
  if (v && v.adjustedSeverity) f.severity = v.adjustedSeverity
  opsFindings.push(f)
}
opsFindings.push(...opsRaw.filter((f) => !isSeriousOps(f)))
opsFindings.sort((a, b) => rank(a.severity) - rank(b.severity))

return {
  scope,
  audits: auditResults,
  opsFindings,
  reactDoctor,
  opsChecksRun: OPS_CHECKS.map((c) => c.check),
  opsDeferred: [
    { check: 'backups', reason: 'un-verifiable from a repo read — verify in the DB console: automated backups / PITR enabled AND a tested restore path' },
  ],
  failedAudits: auditResults.filter((r) => r.failed).map((r) => r.kind),
  unconvergedAudits: auditResults
    .filter((r) => !r.failed && r.converged !== true)
    .map((r) => ({ kind: r.kind, reason: r.convergenceReason || 'completeness unproven', criticErrors: r.criticErrors ?? null })),
}
