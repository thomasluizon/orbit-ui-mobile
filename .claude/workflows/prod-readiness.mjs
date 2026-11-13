export const meta = {
  name: 'prod-readiness',
  description: 'Pre-launch orchestrator that runs the four audit workflows in parallel (Haiku fan-out), adds the ops-layer, static-a11y and repository-hygiene audits no child covers (D11 judgement no gate checks; hygiene covers old, outdated, duplicate and temporary files in five repositories), verifies its own findings, and returns consolidated data for Opus to tier-tag, verdict, and turn into GitHub tickets (D10).',
  phases: [
    { title: 'Audits', detail: 'the four /audit workflows in parallel' },
    { title: 'Ops', detail: 'observability · multi-instance · background durability · staging · concurrency' },
    { title: 'A11y', detail: 'static WCAG 2.2 AA sweep — web + mobile' },
    { title: 'Hygiene', detail: 'old · outdated · duplicate · temporary files — five repositories' },
    { title: 'Verify', detail: 'at most 60 skeptics: one per Blocker/High ops or a11y finding, then one per High or delete hygiene finding; default refuted' },
  ],
}

const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {}
const absolutePath = (path) => typeof path === 'string' && /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path)
if (!absolutePath(parsedArgs.roots?.ui) || !absolutePath(parsedArgs.roots?.api)) {
  throw new Error('prod-readiness workflow requires absolute ui and api roots')
}
const { ui: UI, api: API } = parsedArgs.roots
const hygieneRepositories = parsedArgs.hygiene?.repositories ?? {}
// The cap shares its judged slots across the kinds in this order, so the outdated rows that feed the High tier come first.
const HYGIENE_KINDS = ['outdated', 'temporary', 'duplicate', 'old']
for (const [key, repository] of Object.entries(hygieneRepositories)) {
  if (repository?.root != null && !absolutePath(repository.root)) {
    throw new Error(`prod-readiness workflow requires an absolute hygiene root for ${key}`)
  }
  const unkinded = (Array.isArray(repository?.candidates) ? repository.candidates : []).filter((row) => !HYGIENE_KINDS.includes(row?.kind))
  if (unkinded.length) {
    throw new Error(`prod-readiness workflow requires a kind (${HYGIENE_KINDS.join(', ')}) on each hygiene candidate of ${key}; ${unkinded.length} have none`)
  }
}

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
    deferred: { type: 'boolean' },
    note: { type: 'string' },
    adjustedSeverity: { type: 'string' },
  },
  required: ['refuted', 'note'],
}

const OPS_LADDER = 'Blocker (a whole runtime is dark, or it corrupts user data on scale-out) / High (a single observability gap, a scheduler that double-fires, work lost on restart) / Medium (calibrated — e.g. a missing pre-prod gate)'

const OPS_CHECKS = [
  {
    check: 'observability',
    where: `Sentry across all three runtimes — web ${UI}/apps/web/sentry.server.config.ts + sentry.edge.config.ts + lib/sentry-scrub.ts; mobile ${UI}/apps/mobile/lib/sentry-init.ts + lib/sentry.ts; api ${API}/src/Orbit.Infrastructure/Configuration/SentrySettings.cs + ${API}/src/Orbit.Api/Middleware/UnhandledExceptionHandler.cs. Health: ${API}/src/Orbit.Infrastructure/Services/BackgroundServiceHealthCheck.cs + the MapHealthChecks registration. Alert routing: the Sentry alert rules live in the Sentry console, which a repo read cannot see; the workflow returns them as the deferred check alert-routing, so emit no finding for them.`,
    ready: 'error capture initialized + DSN wired on all three surfaces, an unhandled-exception handler, and a /health endpoint',
    gap: 'a surface with no error capture or no health endpoint is a finding (Blocker if a whole runtime is dark, High for a single gap)',
  },
  {
    check: 'multi-instance',
    where: `IHostedService schedulers (${API}/src/Orbit.Infrastructure/Services/*SchedulerService.cs, Services/Hosting/ScheduledServiceBase.cs) vs Hangfire (${API}/src/Orbit.Infrastructure/BackgroundJobs/HangfireRecurringJobRegistrar.cs, IScheduledJob.cs); any in-memory cache / rate-limit / counter assumed authoritative; session-affinity assumptions`,
    ready: 'recurring work coordinated through Hangfire durable store (one run cluster-wide); no single-instance in-memory authority',
    gap: 'an IHostedService that double-fires on every replica, or an in-memory rate-limit/cache that breaks when a second instance starts (High; Blocker if it corrupts user data on scale-out)',
  },
  {
    check: 'background-durability',
    where: `Hangfire store config (${API}/src/Orbit.Infrastructure/Configuration/BackgroundJobSettings.cs, ${API}/src/Orbit.Api/Extensions/ServiceCollectionExtensions.BackgroundJobs.cs); fire-and-forget paths (RunBackgroundPostResponseWork, push/email dispatch)`,
    ready: 'jobs persisted to a durable store, survive a restart, are idempotent / retried',
    gap: 'in-process fire-and-forget work lost on restart or crash, or a non-idempotent recurring job that double-applies on retry (High)',
  },
  {
    check: 'staging',
    where: `deploy/CI workflows in BOTH repos — ${UI}/.github/workflows/release.yml, test.yml; ${API}/.github/workflows/release.yml, production-plan.yml, staging-reseed.yml. Discover the current state per repo.`,
    ready: 'a staged release sits between merge and prod: production refuses a commit that a healthy staging release has not admitted',
    gap: 'no staging/QA env or no pre-prod gate (Medium, calibrated)',
  },
  {
    check: 'concurrency',
    where: `Read the canonical "Concurrency checklist (inventory item 13)" in ${UI}/.claude/skills/prod-readiness/SKILL.md, then trace its named paths in ${API} and ${UI}. Use the checklist as the sole authority for this dimension.`,
    ready: 'each shared-resource operation satisfies the canonical concurrency checklist',
    gap: 'a source-provable broken interleaving under that checklist, with the competing operations and missing guard',
  },
]

const A11Y_LADDER = 'Blocker (an essential journey cannot complete by keyboard or with assistive technology) / High (a confirmed WCAG 2.2 A/AA failure on a core journey — auth, today, habit logging, settings, billing — or in a shared primitive every screen composes) / Medium (an A/AA failure off the core journeys, or a best-practice gap with concrete user impact)'

const A11Y_CHECKS = [
  {
    check: 'a11y-web',
    where: `${UI}/apps/web — shared primitives and shell first (components/, the app/(app) layout, dialogs, menus, toasts, forms), then the core journeys (auth, today, habit logging, settings, billing)`,
  },
  {
    check: 'a11y-mobile',
    where: `${UI}/apps/mobile — shared primitives and the navigation shell first (components/, sheets, dialogs, tab bar), then the same core journeys; judge React Native semantics (accessibilityRole / accessibilityLabel / accessibilityState, grouped children, focus after navigation)`,
  },
]

const HYGIENE_LADDER = 'High (an agent instruction file that contradicts CLAUDE.md; a runbook, a release skill or a playbook that orders a command, a path or a vendor that does not exist) / Medium (each other old, outdated or temporary finding) / Low (a duplicate asset with a named generator). A hygiene finding is never a Blocker.'

const LEDGER_RULE = 'Every tracked file starts as a suspect. The default verdict is delete or update. A file keeps its current form only with two written answers: (1) why it exists: the reader, consumer or need it serves today; (2) why it is correct exactly as it is: what was checked against the current code or the current decision. No answer to 1 means delete. An answer to 1 and none to 2 means update. "Nobody proved it is dead" is not an answer. A keep verdict without both answers is a defect. Before a delete, search for readers; a real reader is answer 1.'

const HYGIENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: OPS_SCHEMA.properties.findings,
    deferred: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { check: { type: 'string' }, path: { type: 'string' }, reason: { type: 'string' } },
        required: ['check', 'path', 'reason'],
      },
    },
  },
  required: ['findings', 'deferred'],
}

const HYGIENE_CANDIDATE_CAP = 300

/**
 * Splits the cap across the kinds: each kind gets an equal share, and a share that a small kind leaves
 * unused goes to the other kinds. The judged rows keep the HYGIENE_KINDS order and, inside a kind, the given order.
 */
function judgeByKind(candidates, cap) {
  const groups = HYGIENE_KINDS.map((kind) => ({ kind, rows: candidates.filter((row) => row.kind === kind), taken: 0 }))
  let left = cap
  let open = groups.filter((group) => group.rows.length > 0)
  while (left > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(left / open.length))
    for (const group of open) {
      const take = Math.min(share, group.rows.length - group.taken, left)
      group.taken += take
      left -= take
    }
    open = open.filter((group) => group.taken < group.rows.length)
  }
  return {
    judged: groups.flatMap((group) => group.rows.slice(0, group.taken)),
    counts: Object.fromEntries(groups.map((group) => [group.kind, { judged: group.taken, deferred: group.rows.length - group.taken }])),
  }
}

const HYGIENE_CHECKS = [
  {
    repository: 'ui',
    name: 'orbit-ui-mobile',
    where: `the orbit-ui-mobile repository (the ledger rows in the candidates)`,
  },
  {
    repository: 'api',
    name: 'orbit-api',
    where: `the orbit-api repository (the ledger rows in the candidates)`,
  },
  {
    repository: 'landing',
    name: 'orbit-landing-page',
    where: `the orbit-landing-page repository (the ledger rows in the candidates)`,
  },
  {
    repository: 'workshop',
    name: 'thomas-brain',
    where: `the thomas-brain repository (the ledger rows in the candidates)`,
  },
  {
    repository: 'vault',
    name: 'brain vault',
    where: `the brain vault (the ledger rows in the candidates)`,
  },
]

function hygienePrompt(c, root, candidates) {
  return [
    `Repository hygiene check for ${c.name}, rooted at ${root}. The four kinds are old, outdated, duplicate and temporary. You have Read, Grep and Glob and no shell. This is a read-only judgement over file ledger rows; a candidate is a signal and not a verdict.`,
    `The ledger rule, word for word: ${LEDGER_RULE}`,
    `For each candidate row, search for a reader. A reader can write no path: a framework convention, a tool that walks a folder, a config key, a person that a pointer sends to the file. Return a finding only when answer 1 is absent (the fix is delete) or when answer 1 exists and answer 2 fails (the fix is update). Name what the file says and what the code says.`,
    `A file under a public web folder, an app asset folder or a store asset folder can have a deployed reader. Do not return a delete finding for it. Return it in deferred with the check "hygiene-deployed-readers". A record is never a finding: a migration, a vault decision, a journal note, a raw inbox file, a published post, a vendored file with a lock entry.`,
    `Severity ladder: [${HYGIENE_LADDER}]. For each finding return: severity, check ("hygiene-old", "hygiene-outdated", "hygiene-duplicate" or "hygiene-temporary"), title, location (the repository name, then the path), risk (who reads the file and acts on it), evidence (the ledger row and the search terms with their result), fix (delete or update, and what the update says).`,
    `Each candidate carries kind: the first signal that selected it, in the order outdated, temporary, duplicate, old. Judge every kind that the row shows, not only that one.`,
    `Candidates (${candidates.length}), one JSON row each: ${candidates.map((row) => JSON.stringify(row)).join('\n')}`,
  ].join('\n')
}

const ordersDelete = (f) => /\bdelete\b/i.test(f.fix || '')

function a11yPrompt(c) {
  return [
    `Static accessibility sweep "${c.check}" for Orbit. The floor is WCAG 2.2 Level AA and the objective is accessible task completion, never a score. This is a source read: claim only what source can prove.`,
    `Where to look: ${c.where}.`,
    `Judge the a11y judgement no gate owns: native-element-first (a pressable div/View where a button belongs); every ARIA role or RN accessibility prop as a keyboard and focus contract the code must honour (a role added without its key handling or focus management); focus on open, trapped while open, returned on close for dialogs and menus; a localized label in both locales for icon-only controls; colour as the only signal; the 3:1 non-text contrast floor for icons, borders, and state indicators; hit targets under 44 grown by glyph instead of padding; and materially different UI states (empty, loading, validation-error, dialog, menu, toast) that lose semantics the populated state has.`,
    `Gate-owned, do NOT flag: anything the React Doctor steps in guards.yml already fail on, and anything ESLint local/* or the Design Token Guard owns. Runtime-only claims (200% zoom, screen-reader output, the route x state x viewport x input-mode matrix) are OUT of scope: the workflow defers them as a11y-runtime-matrix, so never emit a finding that needs the live DOM.`,
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

function uiInScope(requestedScope) {
  if (!requestedScope || requestedScope === 'both') return true
  if (['ui', 'web', 'mobile', 'frontend'].includes(requestedScope)) return true
  if (['api', 'backend'].includes(requestedScope)) return false
  const normalized = String(requestedScope).replaceAll('\\', '/').toLowerCase()
  return !(normalized.includes('/orbit-api/') || /^(?:\.\/)?(?:src|tests)\//.test(normalized))
}

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
    { kind: k, scope, roots: parsedArgs.roots, measurement: k === 'performance' ? performanceMeasurement : undefined },
  )))
).map((r, i) => r || { kind: AUDIT_KINDS[i], failed: true, findings: [], counts: {}, coverage: [], deferred: [] })

phase('Ops')
const opsResults = await parallel(
  OPS_CHECKS.map((c) => () =>
    agent(opsPrompt(c), { label: `ops:${c.check}`, phase: 'Ops', model: 'haiku', agentType: 'audit-readonly', schema: OPS_SCHEMA })
      .then((r) => ({ check: c.check, result: r }))
  )
)
const opsChecksFailed = OPS_CHECKS
  .map((c, i) => (opsResults[i] && opsResults[i].result ? null : c.check))
  .filter(Boolean)
if (opsChecksFailed.length) log(`ops: ${opsChecksFailed.join(', ')} FAILED (finder died) — coverage UNKNOWN for those checks, never clean`)
const opsRaw = opsResults.filter((x) => x && x.result).flatMap((x) => x.result.findings || [])

phase('A11y')
const a11yInScope = uiInScope(scope)
let a11yResults = []
if (a11yInScope) {
  a11yResults = await parallel(
    A11Y_CHECKS.map((c) => () =>
      agent(a11yPrompt(c), { label: c.check, phase: 'A11y', model: 'haiku', agentType: 'audit-readonly', schema: OPS_SCHEMA })
        .then((r) => ({ check: c.check, result: r }))
    )
  )
} else {
  log(`a11y: not applicable — the resolved scope "${scope}" contains no UI surface`)
}
const a11yChecksFailed = a11yInScope
  ? A11Y_CHECKS.map((c, i) => (a11yResults[i] && a11yResults[i].result ? null : c.check)).filter(Boolean)
  : []
if (a11yChecksFailed.length) log(`a11y: ${a11yChecksFailed.join(', ')} FAILED (finder died) — coverage UNKNOWN for those checks, never clean`)
const a11yRaw = a11yResults.filter((x) => x && x.result).flatMap((x) => x.result.findings || [])

phase('Hygiene')
const hygieneDeferred = []
const hygieneRuns = []
const hygieneCandidates = {}
for (const c of HYGIENE_CHECKS) {
  const repository = hygieneRepositories[c.repository]
  if (!repository || repository.root == null) {
    hygieneDeferred.push({ check: `hygiene-${c.repository}`, path: c.name, reason: repository?.reason || 'the root is not on this machine, or the scope excludes it' })
    continue
  }
  const { judged, counts } = judgeByKind(Array.isArray(repository.candidates) ? repository.candidates : [], HYGIENE_CANDIDATE_CAP)
  hygieneCandidates[c.repository] = counts
  const unjudged = Object.entries(counts).filter(([, count]) => count.deferred > 0)
  if (unjudged.length) {
    const kinds = unjudged.map(([kind, count]) => `${kind} ${count.deferred} of ${count.judged + count.deferred}`).join(', ')
    hygieneDeferred.push({ check: `hygiene-${c.repository}`, path: c.name, reason: `candidates beyond the cap of ${HYGIENE_CANDIDATE_CAP} were not judged (${kinds}); run again on the remainder` })
  }
  hygieneRuns.push({ c, root: repository.root, judged })
}
const hygieneResults = await parallel(
  hygieneRuns.map(({ c, root, judged }) => () =>
    agent(hygienePrompt(c, root, judged), { label: `hygiene:${c.repository}`, phase: 'Hygiene', model: 'haiku', agentType: 'audit-readonly', schema: HYGIENE_SCHEMA })
      .then((r) => ({ repository: c.repository, root, result: r }))
  )
)
const hygieneChecksFailed = hygieneRuns
  .map(({ c }, i) => (hygieneResults[i] && hygieneResults[i].result ? null : c.repository))
  .filter(Boolean)
if (hygieneChecksFailed.length) log(`hygiene: ${hygieneChecksFailed.join(', ')} FAILED (finder died) — coverage UNKNOWN for those repositories, never clean`)
// Each finding keeps the root of its repository, so the skeptic can open a file outside orbit-ui-mobile.
const hygieneRaw = hygieneResults.filter((x) => x && x.result).flatMap((x) => (x.result.findings || []).map((f) => ({ ...f, root: x.root })))
for (const x of hygieneResults.filter((entry) => entry && entry.result)) {
  for (const item of x.result.deferred || []) hygieneDeferred.push(item)
}
for (const f of hygieneRaw) if (rank(f.severity) === 0) f.severity = 'High'

phase('Verify')
const REFUTE_FRAMING = {
  hygiene: 'repository-hygiene finding. Read the cited file and search the repository for a reader. Argue it is FALSE: a reader exists (a framework convention, a tool that walks a folder, a config key, a person a pointer sends to the file), the file is a record, the copy is necessary for a tool, or the doc is correct.',
  ops: 'ops-readiness finding. Read the cited config/code in full context and argue it is a FALSE POSITIVE — Hangfire already coordinates that job, the unhandled-exception handler DOES exist, the runtime really has a staged release gate, the cache is per-request not process-global, or a concurrency guard prevents the cited interleaving.',
  a11y: 'static-a11y finding. Read the cited component in full context and argue it is a FALSE POSITIVE — the control IS a native element further up the tree, the label DOES exist in both locales, the role carries its keyboard contract elsewhere, the state is not user-reachable, a React Doctor step in guards.yml already fails on it, or the severity is inflated.',
}
const ROOTS_FOR = {
  hygiene: (f) => `The repository of this finding is rooted at ${f.root}; its location path is relative to that root.`,
  ops: () => `The repositories are rooted at ${UI} (orbit-ui-mobile) and ${API} (orbit-api); a location path is relative to the root of the repository it names.`,
  a11y: () => `The repository is rooted at ${UI}; the location path is relative to that root.`,
}
// One cap bounds the skeptic fan-out, as in audit.mjs. The sort is stable, so ops and a11y findings come before hygiene findings of the same severity.
const VERIFY_CAP = 60
const verifyQueue = [
  ...opsRaw.filter(isSerious).map((f) => ({ f, layer: 'ops' })),
  ...a11yRaw.filter(isSerious).map((f) => ({ f, layer: 'a11y' })),
  ...hygieneRaw.filter((f) => isSerious(f) || ordersDelete(f)).map((f) => ({ f, layer: 'hygiene' })),
].sort((a, b) => rank(a.f.severity) - rank(b.f.severity))
const verifyTargets = verifyQueue.slice(0, VERIFY_CAP)
const verifyOverflow = verifyQueue.slice(VERIFY_CAP)
if (verifyOverflow.length) log(`verify: ${verifyOverflow.length} findings beyond the adversarial-verify cap of ${VERIFY_CAP} get no skeptic`)
const verdicts = (
  await parallel(
    verifyTargets.map(({ f, layer }) => () =>
      agent(
        [
          `Adversarially REFUTE this ${REFUTE_FRAMING[layer]}`,
          ROOTS_FOR[layer](f),
          `Default to refuted=true when uncertain — the burden is on the finding. A file you cannot open is not a refutation: when you cannot open the cited file, return deferred=true and refuted=false, and name the path you tried in the note.`,
          `Finding: severity=${f.severity} · check=${f.check} · title=${f.title} · location=${f.location || ''} · risk=${f.risk} · evidence=${f.evidence || ''} · fix=${f.fix || ''}.`,
          `Return refuted (bool) + note, and deferred=true only when you could not open the cited file. If real but over-rated, set adjustedSeverity.`,
        ].join('\n'),
        { label: `verify:${f.check}`, phase: 'Verify', model: 'haiku', agentType: 'audit-readonly', schema: OPS_VERDICT }
      ).then((v) => ({ f, v, layer }))
    )
  )
).filter(Boolean)

const survivorsByLayer = { ops: [], a11y: [], hygiene: [] }
for (const { f, v, layer } of verdicts) {
  // A skeptic that cannot open the file has judged nothing, so the finding is never dropped as refuted.
  if (v && v.deferred && layer === 'hygiene') {
    hygieneDeferred.push({ check: f.check, path: f.location || '', reason: `the skeptic could not open the cited file under ${f.root}: ${v.note}` })
    continue
  }
  if (v && v.deferred) {
    f.unverified = 'the skeptic could not open the cited file, so the finding is kept unchallenged; re-verify before acting'
    survivorsByLayer[layer].push(f)
    continue
  }
  if (v && v.refuted) continue
  if (v && v.adjustedSeverity) f.severity = v.adjustedSeverity
  if (!v) f.unverified = 'the skeptic died — kept unchallenged (a dead verifier is not a clean pass); re-verify before acting'
  survivorsByLayer[layer].push(f)
}
// A hygiene finding without a skeptic is not verified, so it is deferred. An ops or a11y gap stays visible with unverified.
for (const { f, layer } of verifyOverflow) {
  if (layer === 'hygiene') {
    hygieneDeferred.push({ check: f.check, path: f.location || '', reason: `beyond the adversarial-verify cap of ${VERIFY_CAP}, so no skeptic judged it; run the sweep again on the remainder` })
    continue
  }
  f.unverified = `beyond the adversarial-verify cap of ${VERIFY_CAP}, so it is kept unchallenged; re-verify before acting`
  survivorsByLayer[layer].push(f)
}
const opsFindings = [...survivorsByLayer.ops, ...opsRaw.filter((f) => !isSerious(f))]
  .sort((a, b) => rank(a.severity) - rank(b.severity))
const a11yFindings = [...survivorsByLayer.a11y, ...a11yRaw.filter((f) => !isSerious(f))]
  .sort((a, b) => rank(a.severity) - rank(b.severity))
const hygieneFindings = [...survivorsByLayer.hygiene, ...hygieneRaw.filter((f) => !isSerious(f) && !ordersDelete(f))]
  .sort((a, b) => rank(a.severity) - rank(b.severity))

return {
  scope,
  audits: auditResults,
  opsFindings,
  a11yFindings,
  hygieneFindings,
  opsChecksRun: OPS_CHECKS.filter((c) => !opsChecksFailed.includes(c.check)).map((c) => c.check),
  opsChecksFailed,
  a11yChecksRun: a11yInScope ? A11Y_CHECKS.filter((c) => !a11yChecksFailed.includes(c.check)).map((c) => c.check) : [],
  a11yChecksFailed,
  hygieneChecksRun: hygieneRuns.map(({ c }) => c.repository).filter((repository) => !hygieneChecksFailed.includes(repository)),
  hygieneChecksFailed,
  hygieneCandidates,
  hygieneDeferred,
  a11yNotApplicable: a11yInScope ? null : `the resolved scope "${scope}" contains no UI surface`,
  opsDeferred: [
    { check: 'alert-routing', reason: 'un-verifiable from a repo read: verify in the Sentry console that the alert rules of all three runtimes route to a sink someone watches' },
    { check: 'backups', reason: 'un-verifiable from a repo read — verify in the DB console: automated backups / PITR enabled AND a tested restore path' },
    { check: 'paid-api-cost-caps', reason: 'un-verifiable from a repo read: verify in each provider console (OpenAI, Stripe, FCM, AWS): a hard monthly cap AND a spend alert at 50% of it. An in-app rate limit bounds one caller, only the provider cap bounds the bill' },
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
