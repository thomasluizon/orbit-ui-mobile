import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"

import { REPO_ROOT, T } from "./_harness.mjs"
import {
  applyMeasuredQueryContexts,
  attachPerformanceMetrics,
  measuredHotpathMappingFailure,
  performanceMeasurementPrompt,
  resolvePerformanceMeasurement,
} from "../lib/performance-measurement.mjs"

const availableInput = () => ({
  status: "available",
  statsReset: "2026-03-18T13:12:11.039503Z",
  windowDays: 142.61,
  accountSkew: { maxHabitsPerAccount: 848, averageHabitsPerAccount: 21.69 },
  tableStats: [
    { table: "Habits", liveRows: 1106, columnCount: 29, seqScan: 310101, seqTupRead: 196237004 },
    { table: "HabitLogs", liveRows: 4014, columnCount: 9, seqScan: 58210, seqTupRead: 129999081 },
  ],
  queryStats: [
    {
      queryId: "habit-logs",
      rootTable: "HabitLogs",
      calls: 5462,
      rows: 12972237,
      bytesPerRow: 97.19,
      queryShape: 'SELECT h."Id", h."CreatedAtUtc", h."Date", h."DeletedAtUtc", h."HabitId", h."IsDeleted", h."Note", h."UpdatedAtUtc", h."Value" FROM "HabitLogs" h WHERE h."HabitId" = ANY ($1)',
    },
    {
      queryId: "habit-list",
      rootTable: "Habits",
      calls: 23802,
      rows: 10938123,
      bytesPerRow: 348.67,
      queryShape: `SELECT ${Array.from({ length: 29 }, (_, index) => `h."Column${index}"`).join(", ")} FROM "Habits" h WHERE h."UserId" = $1 ORDER BY h."Id"`,
    },
    {
      queryId: "reminder-sweep",
      rootTable: "Habits",
      calls: 145349,
      rows: 2558264,
      bytesPerRow: 348.67,
      queryShape: 'SELECT h."Id", h."ReminderEnabled" FROM "Habits" h WHERE h."ReminderEnabled"',
    },
    {
      queryId: "bounded-projection",
      rootTable: "Habits",
      calls: 100,
      rows: 1000,
      bytesPerRow: 40,
      queryShape: 'SELECT h."Id", h."Title", h."DueDate" FROM "Habits" h WHERE h."UserId" = $1 ORDER BY h."Id" LIMIT $2 OFFSET $3',
    },
    /**
     * A background sweep that reads the WHOLE row, which is what the background budget is actually
     * for. It exists because `reminder-sweep` stopped signalling once egress was charged to the
     * projection instead of the table row, and it stopped for the right reason: it selects 2 of 29
     * columns, so it moves about 13 MB a month, not the 190 MB the full-row arithmetic claimed.
     * Losing the only over-budget fixture would have quietly removed the signal from coverage.
     */
    {
      queryId: "wide-sweep",
      rootTable: "Habits",
      calls: 145349,
      rows: 2558264,
      bytesPerRow: 348.67,
      queryShape: 'SELECT * FROM "Habits" h WHERE h."ReminderEnabled"',
    },
  ],
})

const measuredMappings = () => [
  { queryId: "habit-logs", location: "src/HabitLogsQuery.cs:20", executionContext: "request" },
  { queryId: "habit-list", location: "src/HabitsQuery.cs:20", executionContext: "request" },
  { queryId: "reminder-sweep", location: "src/ReminderJob.cs:20", executionContext: "background" },
  { queryId: "bounded-projection", location: "src/BoundedHabitsQuery.cs:20", executionContext: "request" },
  { queryId: "wide-sweep", location: "src/WideReminderJob.cs:20", executionContext: "background" },
]

export const cases = async () => {
  const auditWorkflow = readFileSync(join(REPO_ROOT, ".claude", "workflows", "audit.mjs"), "utf8")
  const readinessWorkflow = readFileSync(join(REPO_ROOT, ".claude", "workflows", "prod-readiness.mjs"), "utf8")
  T("performance-measurement: workflow metadata remains the required first statement", auditWorkflow.startsWith("export const meta = {"))
  T("performance-measurement: audit workflow executes the four measured signals", ["unbounded-user-list", "full-entity-projection", "large-table-fraction", "background-sweep-budget"].every((signal) => auditWorkflow.includes(signal)))
  T("performance-measurement: audit workflow returns an explicit performance verdict", auditWorkflow.includes("performanceVerdict: performanceMeasurement?.verdict"))
  T("performance-measurement: prod-readiness forwards only the performance measurement to the performance child", readinessWorkflow.includes("k === 'performance' ? performanceMeasurement : undefined"))
  const scopeResolutionIndex = auditWorkflow.indexOf("const surfaces = resolveSurfaces(kind, scope)")
  const scopedMeasurementIndex = auditWorkflow.indexOf("if (kind === 'performance' && surfaces.some(isApiSurface))")
  T("performance-measurement: requested scope is applied before API hot paths are measured", scopeResolutionIndex >= 0 && scopedMeasurementIndex > scopeResolutionIndex)
  const scopeFunctions = auditWorkflow.slice(
    auditWorkflow.indexOf("const isApiSurface"),
    auditWorkflow.indexOf("function finderPrompt"),
  )
  const uiPathReachesApiSurface = runInNewContext(
    `${scopeFunctions}\nresolveSurfaces('performance', 'apps/web/hooks/use-habits.ts').some(isApiSurface)`,
    {
      KIND: {
        performance: {
          surfaces: [
            { label: "api-queries", where: "orbit-api queries" },
            { label: "fe-web", where: "apps/web" },
          ],
        },
      },
    },
  )
  T("performance-measurement: a UI path scope excludes API hot-path measurement", !uiPathReachesApiSurface)
  T(
    "performance-measurement: a failed measured hot-path mapping fails the audit with a named reason",
    auditWorkflow.includes("measured production hot paths could not be mapped to API source"),
  )
  T(
    "performance-measurement: an empty measured hot-path mapping fails with a distinct reason",
    auditWorkflow.includes("measured production hot-path mapping was empty"),
  )

  const measurementFunctions = auditWorkflow.slice(
    auditWorkflow.indexOf("const PERFORMANCE_MONTH_DAYS"),
    auditWorkflow.indexOf("const MEASURED_METRIC_KEYS"),
  )
  const performanceAttachmentFunctions = auditWorkflow.slice(
    auditWorkflow.indexOf("const MEASURED_METRIC_KEYS"),
    auditWorkflow.indexOf("const UI"),
  )
  const offsetOnlyIsBounded = runInNewContext(
    `${measurementFunctions}\nresolvePerformanceMeasurement({
      status: 'available',
      windowDays: 1,
      queryStats: [{
        queryId: 'offset-only',
        rootTable: 'Habits',
        calls: 1,
        rows: 10,
        bytesPerRow: 10,
        queryShape: 'SELECT h."Id" FROM "Habits" h WHERE h."UserId" = $1 OFFSET $2',
      }],
    }).rowsRanking[0].bounded`,
  )
  T("performance-measurement: OFFSET without a row limit is not bounded", !offsetOnlyIsBounded)

  const mappingMeasurement = {
    rowsRanking: [{ queryId: "first" }, { queryId: "second" }],
  }
  const mappingFailureCases = [
    ["null", measuredHotpathMappingFailure(null, mappingMeasurement)],
    ["undefined", measuredHotpathMappingFailure(undefined, mappingMeasurement)],
    ["empty", measuredHotpathMappingFailure({ mappings: [] }, mappingMeasurement)],
    ["all-empty", measuredHotpathMappingFailure({ mappings: [{}] }, mappingMeasurement)],
    ["partial", measuredHotpathMappingFailure({
      mappings: [{ queryId: "first", location: "src/First.cs:1", executionContext: "request" }],
    }, mappingMeasurement)],
  ]
  const workflowMappingFailures = runInNewContext(
    `${measurementFunctions}\nconst mappingMeasurement = ${JSON.stringify(mappingMeasurement)};
    [
      measuredHotpathMappingFailure(null, mappingMeasurement),
      measuredHotpathMappingFailure(undefined, mappingMeasurement),
      measuredHotpathMappingFailure({ mappings: [] }, mappingMeasurement),
      measuredHotpathMappingFailure({ mappings: [{}] }, mappingMeasurement),
      measuredHotpathMappingFailure({ mappings: [{ queryId: 'first', location: 'src/First.cs:1', executionContext: 'request' }] }, mappingMeasurement),
      measuredHotpathMappingFailure({ mappings: [
        { queryId: 'first', location: 'src/First.cs:1', executionContext: 'request' },
        { queryId: 'second', location: 'src/SecondJob.cs:1', executionContext: 'background' },
      ], findings: [] }, mappingMeasurement),
    ]`,
  )
  T(
    "performance-measurement: null and undefined mapper results are errors",
    mappingFailureCases.slice(0, 2).every(([, failure]) => failure === "measured production hot paths could not be mapped to API source"),
    JSON.stringify(mappingFailureCases),
  )
  T(
    "performance-measurement: empty and all-empty mappings have the empty-mapping reason",
    mappingFailureCases.slice(2, 4).every(([, failure]) => failure === "measured production hot-path mapping was empty"),
    JSON.stringify(mappingFailureCases),
  )
  T(
    "performance-measurement: a partial mapping names the missing measured query",
    mappingFailureCases[4][1]?.includes("mapping was incomplete") && mappingFailureCases[4][1]?.includes("second"),
    mappingFailureCases[4][1],
  )
  T(
    "performance-measurement: a complete mapping can report no findings without failing readiness",
    measuredHotpathMappingFailure({
      mappings: [
        { queryId: "first", location: "src/First.cs:1", executionContext: "request" },
        { queryId: "second", location: "src/SecondJob.cs:1", executionContext: "background" },
      ],
      findings: [],
    }, mappingMeasurement) === null,
  )
  T(
    "performance-measurement: the workflow enforces every mapping readiness state",
    JSON.stringify(workflowMappingFailures) === JSON.stringify([
      ...mappingFailureCases.map(([, failure]) => failure),
      null,
    ]),
    JSON.stringify(workflowMappingFailures),
  )

  const measurementAndFindPhases = auditWorkflow.slice(
    auditWorkflow.indexOf("let measuredFindings = []"),
    auditWorkflow.indexOf("async function verifySerious"),
  )
  let mappingFallback = null
  let mappingFallbackError = null
  try {
    mappingFallback = await runInNewContext(
      `(async () => {
        ${measurementFunctions}
        ${performanceAttachmentFunctions}
        const phases = []
        const agentLabels = []
        const finderMeasurements = []
        const kind = 'performance'
        const scope = 'api'
        const surfaces = [{ label: 'api-queries', where: 'orbit-api queries' }]
        const isApiSurface = () => true
        const phase = (name) => phases.push(name)
        const log = () => {}
        const scopeLabelFor = () => 'API'
        const measurementFinderPrompt = () => 'map measured statements'
        const finderPrompt = (_kind, _surface, _scope, measurement) => {
          finderMeasurements.push({ verdict: measurement.verdict, reason: measurement.reason })
          return 'find code issues'
        }
        const MEASURED_FINDINGS_SCHEMA = {}
        const FINDINGS_SCHEMA = {}
        const parallel = (tasks) => Promise.all(tasks.map((task) => task()))
        const dedupeFresh = (findings) => findings
        const agent = async (_prompt, options) => {
          agentLabels.push(options.label)
          if (options.label === 'find:measured-hotpaths') return { mappings: [], findings: [] }
          return { findings: [{ title: 'unpaginated habit list', location: 'src/HabitsQuery.cs:20' }] }
        }
        let performanceMeasurement = resolvePerformanceMeasurement({
          status: 'available',
          statsReset: '2026-03-18T13:12:11.039503Z',
          windowDays: 1,
          tableStats: [{ table: 'Habits', liveRows: 10, columnCount: 2 }],
          queryStats: [{
            queryId: 'catalog-query',
            rootTable: 'Habits',
            calls: 1,
            rows: 1,
            bytesPerRow: 10,
            queryShape: 'SELECT h."Id" FROM "Habits" h',
          }],
        })
        ${measurementAndFindPhases}
        return { performanceMeasurement, measurementFinderFailed, phases, agentLabels, finderMeasurements, firstPass, findings }
      })()`,
    )
  } catch (error) {
    mappingFallbackError = error
  }
  const expectedMappingReason = "measured production hot-path mapping was empty"
  T(
    "performance-measurement: an unmapped measured statement falls back to CODE_ONLY and runs the code finder",
    mappingFallbackError === null
      && mappingFallback?.performanceMeasurement.verdict === "CODE_ONLY"
      && mappingFallback.performanceMeasurement.reason === expectedMappingReason
      && mappingFallback.measurementFinderFailed === true
      && JSON.stringify(mappingFallback.phases) === JSON.stringify(["Measure", "Find"])
      && JSON.stringify(mappingFallback.agentLabels) === JSON.stringify(["find:measured-hotpaths", "find:api-queries"])
      && mappingFallback.finderMeasurements[0]?.verdict === "CODE_ONLY"
      && mappingFallback.finderMeasurements[0]?.reason === expectedMappingReason
      && mappingFallback.firstPass[0]?.findings[0]?.title === "unpaginated habit list",
    mappingFallbackError?.message || JSON.stringify(mappingFallback),
  )

  let nonPerformanceAudit = null
  let nonPerformanceAuditError = null
  try {
    nonPerformanceAudit = await runInNewContext(
      `(async () => {
        ${measurementFunctions}
        ${performanceAttachmentFunctions}
        const phases = []
        const kind = 'security'
        const scope = 'both'
        const surfaces = [{ label: 'authz-isolation', where: 'authorization handlers' }]
        const performanceMeasurement = null
        const isApiSurface = () => true
        const phase = (name) => phases.push(name)
        const log = () => {}
        const scopeLabelFor = () => 'both repos'
        const finderPrompt = () => 'find security issues'
        const FINDINGS_SCHEMA = {}
        const parallel = (tasks) => Promise.all(tasks.map((task) => task()))
        const agent = async () => ({ findings: [{ title: 'cross-account read', location: 'src/HabitsQuery.cs:20' }] })
        const dedupeFresh = (findings) => findings
        ${measurementAndFindPhases}
        return { phases, findings }
      })()`,
    )
  } catch (error) {
    nonPerformanceAuditError = error
  }
  T(
    "performance-measurement: a non-performance audit passes findings through without measurement",
    nonPerformanceAuditError === null
      && JSON.stringify(nonPerformanceAudit?.phases) === JSON.stringify(["Find"])
      && nonPerformanceAudit.findings[0]?.title === "cross-account read",
    nonPerformanceAuditError?.message || JSON.stringify(nonPerformanceAudit),
  )

  const unresolvedMeasurement = resolvePerformanceMeasurement(availableInput())
  const measurement = applyMeasuredQueryContexts(unresolvedMeasurement, measuredMappings())
  const workflowMeasurement = runInNewContext(
    `${measurementFunctions}\napplyMeasuredQueryContexts(
      resolvePerformanceMeasurement(${JSON.stringify(availableInput())}),
      ${JSON.stringify(measuredMappings())},
    )`,
  )
  T("performance-measurement: an available sample produces a measured verdict", measurement.verdict === "MEASURED")
  T("performance-measurement: rows ranking keeps the statement with the most rows first", measurement.rowsRanking[0]?.queryId === "habit-logs", measurement.rowsRanking.map((entry) => entry.queryId).join(","))
  T("performance-measurement: byte-weighted ranking makes the full habit list the top cost", measurement.egressRanking[0]?.queryId === "habit-list", measurement.egressRanking.map((entry) => entry.queryId).join(","))
  T("performance-measurement: an unbounded user list is signaled", measurement.signals.some((signal) => signal.kind === "unbounded-user-list" && signal.queryId === "habit-list"))
  T("performance-measurement: a full-entity projection is signaled from the real column count", measurement.signals.some((signal) => signal.kind === "full-entity-projection" && signal.queryId === "habit-list"))
  T("performance-measurement: a query returning a large table fraction is signaled", measurement.signals.some((signal) => signal.kind === "large-table-fraction" && signal.queryId === "habit-logs"))
  T("performance-measurement: a recurring sweep over budget is signaled", measurement.signals.some((signal) => signal.kind === "background-sweep-budget" && signal.queryId === "wide-sweep"))
  /**
   * The same assertion used to name `reminder-sweep`, and it passed for the WRONG reason. That
   * query selects 2 of the 29 Habits columns, so charging it the full 348.67 byte row claimed
   * 190 MB a month against a real 13 MB, and the background budget fired on a query that was
   * nowhere near it. Now that egress follows the projection, it correctly does not fire, and
   * `wide-sweep` (`select *`, identical row and call counts) carries the signal instead.
   */
  T(
    "performance-measurement: a NARROW background sweep is no longer a false positive",
    !measurement.signals.some((signal) => signal.kind === "background-sweep-budget" && signal.queryId === "reminder-sweep"),
    JSON.stringify(measurement.rowsRanking.find((query) => query.queryId === "reminder-sweep")?.monthlyEgressBytes),
  )
  T("performance-measurement: an indirectly scoped request is not mislabeled as a background sweep", !workflowMeasurement.signals.some((signal) => signal.kind === "background-sweep-budget" && signal.queryId === "habit-logs"))
  T("performance-measurement: an indirectly scoped request without a row limit is unbounded", workflowMeasurement.signals.some((signal) => signal.kind === "unbounded-user-list" && signal.queryId === "habit-logs"))
  T("performance-measurement: a background sweep does not require a row limit", !workflowMeasurement.signals.some((signal) => signal.kind === "unbounded-user-list" && signal.queryId === "reminder-sweep"))
  T("performance-measurement: a bounded projected query is not signaled", !measurement.signals.some((signal) => signal.queryId === "bounded-projection"), JSON.stringify(measurement.signals))

  const codeOnly = resolvePerformanceMeasurement({ status: "unavailable", reason: "permission denied for pg_stat_statements" })
  T("performance-measurement: unreadable production views produce CODE_ONLY", codeOnly.verdict === "CODE_ONLY")
  T("performance-measurement: the code-only verdict retains the named reason", codeOnly.reason === "permission denied for pg_stat_statements", codeOnly.reason)
  const malformed = resolvePerformanceMeasurement({ status: "available", windowDays: 0, queryStats: [] })
  T("performance-measurement: malformed measurement fails to code-only instead of passing", malformed.verdict === "CODE_ONLY" && malformed.reason.includes("windowDays"), malformed.reason)

  const prompt = performanceMeasurementPrompt(measurement)
  T("performance-measurement: finder context carries production account skew", prompt.includes('"maxHabitsPerAccount":848'))
  T("performance-measurement: finder context carries both cost and row rankings", prompt.includes('"rankedByMonthlyEgress"') && prompt.includes('"rankedByRows"'))

  /**
   * P1, connector pass 6 on #699: collection can return more query shapes than the bounded mapper
   * prompt displays. A call-heavy shape outside both top-20 slices was never shown to the mapper,
   * but mapping validation still required it and downgraded a valid production measurement to
   * CODE_ONLY. The prompt and coverage check must use the same derived query-ID set.
   */
  const promptOverflowInput = {
    status: "available",
    windowDays: 1,
    tableStats: [{ table: "Habits", liveRows: 10000, columnCount: 2 }],
    queryStats: [
      ...Array.from({ length: 20 }, (_, index) => ({
        queryId: `displayed-${index + 1}`,
        rootTable: "Habits",
        calls: 20 - index,
        rows: (20 - index) * 100,
        bytesPerRow: 20,
        queryShape: 'SELECT * FROM "Habits" h',
      })),
      {
        queryId: "call-heavy-outside-prompt",
        rootTable: "Habits",
        calls: 1000000,
        rows: 1,
        bytesPerRow: 20,
        queryShape: 'SELECT h."Id" FROM "Habits" h',
      },
    ],
  }
  const promptOverflowMeasurement = resolvePerformanceMeasurement(promptOverflowInput)
  const promptedRankings = JSON.parse(performanceMeasurementPrompt(promptOverflowMeasurement))
  const promptedQueryIds = new Set([
    ...promptedRankings.rankedByMonthlyEgress,
    ...promptedRankings.rankedByRows,
  ].map((query) => query.queryId))
  const promptMappings = [...promptedQueryIds].map((queryId) => ({
    queryId,
    location: `src/${queryId}.cs:1`,
    executionContext: "request",
  }))
  const promptOverflowFailure = measuredHotpathMappingFailure(
    { mappings: promptMappings, findings: [] },
    promptOverflowMeasurement,
  )
  let promptOverflowResult = null
  let promptOverflowError = null
  try {
    promptOverflowResult = applyMeasuredQueryContexts(promptOverflowMeasurement, promptMappings)
  } catch (error) {
    promptOverflowError = error
  }
  const workflowPromptOverflow = runInNewContext(
    `${measurementFunctions}
    const measurement = resolvePerformanceMeasurement(${JSON.stringify(promptOverflowInput)});
    const prompt = JSON.parse(performanceMeasurementPrompt(measurement));
    const promptedIds = new Set([...prompt.rankedByMonthlyEgress, ...prompt.rankedByRows].map((query) => query.queryId));
    const mappings = [...promptedIds].map((queryId) => ({ queryId, location: 'src/' + queryId + '.cs:1', executionContext: 'request' }));
    const failure = measuredHotpathMappingFailure({ mappings, findings: [] }, measurement);
    let result = null;
    let error = null;
    try { result = applyMeasuredQueryContexts(measurement, mappings); } catch (caught) { error = caught.message; }
    ({ failure, verdict: result?.verdict ?? 'CODE_ONLY', error, promptedIds: [...promptedIds] })`,
  )
  T(
    "performance-measurement: a call-heavy shape outside both mapper slices does not downgrade to CODE_ONLY",
    !promptedQueryIds.has("call-heavy-outside-prompt")
      && promptOverflowFailure === null
      && promptOverflowError === null
      && promptOverflowResult?.verdict === "MEASURED"
      && workflowPromptOverflow.failure === null
      && workflowPromptOverflow.error === null
      && workflowPromptOverflow.verdict === "MEASURED"
      && !workflowPromptOverflow.promptedIds.includes("call-heavy-outside-prompt"),
    JSON.stringify({ promptOverflowFailure, error: promptOverflowError?.message, workflowPromptOverflow }),
  )

  const enriched = attachPerformanceMetrics([
    { queryId: "habit-list", monthlyEgressBytes: 1, title: "Unbounded habits" },
  ], measurement)
  T("performance-measurement: findings take metrics from the measured query rather than agent prose", enriched[0].monthlyEgressBytes === measurement.egressRanking[0].monthlyEgressBytes, JSON.stringify(enriched[0]))

  /**
   * P1, connector pass 3 on #699: measure the PROJECTED result width, not the full table row.
   * `bytesPerRow` describes the whole row, so charging it to a narrow projection overstated a
   * careful query in direct proportion to how well it was written, which is backwards for a signal
   * meant to find unbounded reads. Every case below is run through BOTH copies of the logic, the
   * tools/lib module and the workflow slice, because two copies that must agree are how this
   * defect class keeps coming back.
   */
  const projectionInput = (queryShape) => ({
    ...availableInput(),
    tableStats: [{ table: "Habits", liveRows: 1106, columnCount: 20, seqScan: 1, seqTupRead: 1 }],
    queryStats: [{ queryId: "probe", rootTable: "Habits", calls: 100, rows: 1000, bytesPerRow: 400, queryShape }],
  })
  const probe = (queryShape) => {
    const fromLib = resolvePerformanceMeasurement(projectionInput(queryShape)).rowsRanking[0]
    const fromWorkflow = runInNewContext(`${measurementFunctions}\nresolvePerformanceMeasurement(${JSON.stringify(projectionInput(queryShape))})`).rowsRanking[0]
    return { fromLib, fromWorkflow }
  }

  /**
   * The metric is EXACT or UNKNOWN, never estimated. Charging the full row width overstated a narrow
   * projection; prorating by the fraction of columns selected then understated it, because column
   * widths differ by orders of magnitude. Each of those fixes became the next connector P1, four
   * passes running, so the estimate itself is the defect and it is gone rather than refined.
   */
  const narrow = probe('SELECT h."Id", h."UserId" FROM "Habits" h')
  T(
    "performance-measurement: a narrow projection reports UNKNOWN egress rather than an estimate",
    narrow.fromLib.projectionColumns === 2
      && narrow.fromLib.projectedBytesPerRow === null
      && narrow.fromLib.monthlyEgressBytes === null,
    JSON.stringify({ columns: narrow.fromLib.projectionColumns, bytes: narrow.fromLib.projectedBytesPerRow, egress: narrow.fromLib.monthlyEgressBytes }),
  )
  T(
    "performance-measurement: the workflow copy also reports UNKNOWN for a narrow projection",
    narrow.fromWorkflow.projectionColumns === narrow.fromLib.projectionColumns
      && narrow.fromWorkflow.projectedBytesPerRow === null
      && narrow.fromWorkflow.monthlyEgressBytes === null,
    JSON.stringify({ workflow: narrow.fromWorkflow.monthlyEgressBytes, lib: narrow.fromLib.monthlyEgressBytes }),
  )
  /** A whole-row read IS the measured row width, so it keeps an exact figure. That is the shape
   * behind the 112% Supabase overage, and it must never become unknown. */
  const wholeRowEgress = probe('SELECT * FROM "Habits" h')
  T(
    "performance-measurement: a whole-row projection keeps the exact measured row width",
    wholeRowEgress.fromLib.projectedBytesPerRow === 400
      && wholeRowEgress.fromWorkflow.projectedBytesPerRow === 400
      && Math.round(wholeRowEgress.fromLib.monthlyEgressBytes) === Math.round(wholeRowEgress.fromWorkflow.monthlyEgressBytes),
    JSON.stringify({ lib: wholeRowEgress.fromLib.projectedBytesPerRow, workflow: wholeRowEgress.fromWorkflow.projectedBytesPerRow }),
  )

  /** `select *` counted ONE column and so never matched full-entity-projection, which is the signal
   * a star should trigger most reliably of all. */
  const star = probe('SELECT * FROM "Habits" h')
  T(
    "performance-measurement: a star projection is the whole row and IS a full-entity projection",
    star.fromLib.projectionColumns === 20 && star.fromLib.signals.includes("full-entity-projection"),
    JSON.stringify({ columns: star.fromLib.projectionColumns, signals: star.fromLib.signals }),
  )
  const qualifiedStar = probe('SELECT h.* FROM "Habits" h')
  T("performance-measurement: a qualified star is also the whole row", qualifiedStar.fromLib.projectionColumns === 20, String(qualifiedStar.fromLib.projectionColumns))

  /** A comma inside a function call is not a column boundary. This over-counted 2 columns as 3 and
   * could raise full-entity-projection on a query that projects almost nothing. */
  const nested = probe('SELECT COALESCE(h."Note", h."Title"), h."Id" FROM "Habits" h')
  T("performance-measurement: a comma inside a function call is not a column boundary", nested.fromLib.projectionColumns === 2, String(nested.fromLib.projectionColumns))

  /**
   * P1, connector pass 4 on #699: an EMPTY public table reports a legitimate `n_live_tup` of 0.
   * Requiring a positive count threw, which downgraded the WHOLE measurement to CODE_ONLY and cost a
   * full readiness verdict over a table nobody had written to yet.
   */
  const emptyTableInput = {
    ...availableInput(),
    tableStats: [{ table: "Habits", liveRows: 0, columnCount: 20, seqScan: 1, seqTupRead: 1 }],
    queryStats: [{ queryId: "probe", rootTable: "Habits", calls: 10, rows: 0, bytesPerRow: 400, queryShape: 'SELECT * FROM "Habits" h' }],
  }
  const emptyTable = resolvePerformanceMeasurement(emptyTableInput)
  T(
    "performance-measurement: an empty table stays MEASURED instead of collapsing to CODE_ONLY",
    emptyTable.status === "available" && emptyTable.verdict === "MEASURED",
    JSON.stringify({ status: emptyTable.status, reason: emptyTable.reason }),
  )
  T(
    "performance-measurement: an empty table has an unknown fraction rather than Infinity",
    emptyTable.rowsRanking[0].tableFraction === null
      && !emptyTable.rowsRanking[0].signals.includes("large-table-fraction"),
    JSON.stringify({ fraction: emptyTable.rowsRanking[0].tableFraction, signals: emptyTable.rowsRanking[0].signals }),
  )

  /**
   * P1, connector pass 4 on #699: every finder may supply `monthlyEgressBytes` and the final sorter
   * trusts it, but only the mapper's findings were normalized. An invented value could become the
   * top finding and drive ticket priority, so measurement is authoritative at EVERY merge.
   */
  const laundered = attachPerformanceMetrics([
    { queryId: "habit-list", monthlyEgressBytes: 999999999, title: "real, but with an agent's number" },
    { queryId: "not-a-measured-id", monthlyEgressBytes: 888888888, title: "invented id" },
    { monthlyEgressBytes: 777777777, title: "no id at all" },
  ], measurement)
  T(
    "performance-measurement: a known queryId is overwritten from the measurement, not the agent",
    laundered[0].monthlyEgressBytes === measurement.rowsRanking.find((q) => q.queryId === "habit-list").monthlyEgressBytes,
    JSON.stringify(laundered[0]),
  )
  T(
    "performance-measurement: an unknown queryId loses both the id and every metric it claimed",
    laundered[1].queryId === undefined && laundered[1].monthlyEgressBytes === undefined && laundered[1].title === "invented id",
    JSON.stringify(laundered[1]),
  )
  T(
    "performance-measurement: a finding with no queryId cannot carry an egress number into ranking",
    laundered[2].monthlyEgressBytes === undefined && laundered[2].title === "no id at all",
    JSON.stringify(laundered[2]),
  )

  /**
   * THE guard against this defect class, rather than against one more instance of it.
   *
   * `tools/lib/performance-measurement.mjs` and the copy inlined in `.claude/workflows/audit.mjs`
   * must agree, and they cannot be merged into one module because a workflow script is sandboxed and
   * cannot import from disk. Every past fix had to be applied twice and the second copy is where it
   * was missed. So the copies are compared directly, over a corpus that covers each branch of the
   * projection and egress logic. A future edit to either copy alone fails here.
   */
  /**
   * P1, connector pass 5 on #699: only a TOP-LEVEL row limit bounds the statement. A correlated
   * subquery's `LIMIT 1` marked the whole query bounded, which suppressed `unbounded-user-list`, the
   * principal signal, on exactly the unbounded user list this audit exists to catch.
   */
  const subqueryLimit = probe('SELECT h."Id", (SELECT g."Name" FROM "Goals" g WHERE g."HabitId" = h."Id" LIMIT 1) FROM "Habits" h WHERE h."UserId" = $1')
  T(
    "performance-measurement: a LIMIT inside a subquery does not bound the outer statement",
    subqueryLimit.fromLib.bounded === false && subqueryLimit.fromWorkflow.bounded === false,
    JSON.stringify({ lib: subqueryLimit.fromLib.bounded, workflow: subqueryLimit.fromWorkflow.bounded }),
  )
  const outerLimit = probe('SELECT h."Id" FROM "Habits" h WHERE h."UserId" = $1 LIMIT 50')
  T(
    "performance-measurement: a top-level LIMIT still bounds the statement",
    outerLimit.fromLib.bounded === true && outerLimit.fromWorkflow.bounded === true,
    JSON.stringify({ lib: outerLimit.fromLib.bounded, workflow: outerLimit.fromWorkflow.bounded }),
  )

  /**
   * P1, connector pass 5 on #699: counting expressions was an inference, not a proof. `SELECT h.*,
   * g.*` has more expressions than the root table has columns while `bytesPerRow` measures only `h`,
   * so an exact figure there understates egress and can suppress the background-budget signal.
   */
  const joinedStars = probe('SELECT h.*, g.* FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"')
  T(
    "performance-measurement: a projection spanning a join is NOT an exact root-row width",
    joinedStars.fromLib.projectedBytesPerRow === null && joinedStars.fromWorkflow.projectedBytesPerRow === null,
    JSON.stringify({ lib: joinedStars.fromLib.projectedBytesPerRow, workflow: joinedStars.fromWorkflow.projectedBytesPerRow }),
  )
  const bareStarOverJoin = probe('SELECT * FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"')
  T(
    "performance-measurement: a bare star over a join is not the root row either",
    bareStarOverJoin.fromLib.projectedBytesPerRow === null && bareStarOverJoin.fromWorkflow.projectedBytesPerRow === null,
    JSON.stringify({ lib: bareStarOverJoin.fromLib.projectedBytesPerRow }),
  )
  const rootStarOverJoin = probe('SELECT h.* FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"')
  T(
    "performance-measurement: the ROOT alias star over a join IS the measured root row",
    rootStarOverJoin.fromLib.projectedBytesPerRow === 400 && rootStarOverJoin.fromWorkflow.projectedBytesPerRow === 400,
    JSON.stringify({ lib: rootStarOverJoin.fromLib.projectedBytesPerRow }),
  )
  const joinedAliasStar = probe('SELECT g.* FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"')
  T(
    "performance-measurement: a NON-root alias star is not the measured row width",
    joinedAliasStar.fromLib.projectedBytesPerRow === null && joinedAliasStar.fromWorkflow.projectedBytesPerRow === null,
    JSON.stringify({ lib: joinedAliasStar.fromLib.projectedBytesPerRow }),
  )

  /**
   * P1, connector pass 5 on #699: CODE_ONLY is the most dangerous path to trust, not the safest.
   * With no measurement there is nothing to overwrite an agent's numbers with, and the skeptic reads
   * a `queryId` as normalized production evidence.
   */
  const unmeasured = attachPerformanceMetrics(
    [{ queryId: 'habit-list', monthlyEgressBytes: 123456789, title: 'invented on a CODE_ONLY run' }],
    { status: 'unavailable', verdict: 'CODE_ONLY', reason: 'no production access' },
  )
  T(
    "performance-measurement: an unavailable measurement strips ids and metrics rather than trusting them",
    unmeasured[0].queryId === undefined && unmeasured[0].monthlyEgressBytes === undefined && unmeasured[0].title === 'invented on a CODE_ONLY run',
    JSON.stringify(unmeasured[0]),
  )

  const equivalenceCorpus = [
    'SELECT * FROM "Habits" h',
    'SELECT h.* FROM "Habits" h',
    'SELECT h."Id" FROM "Habits" h',
    'SELECT h."Id", h."UserId" FROM "Habits" h',
    'SELECT COALESCE(h."Note", h."Title"), h."Id" FROM "Habits" h',
    'SELECT DISTINCT h."Id" FROM "Habits" h',
    'SELECT h."Id" FROM "Habits" h WHERE h."UserId" = $1 LIMIT 50',
    'SELECT h."Id" FROM "Habits" h WHERE h."UserId" = $1 OFFSET $2',
    'SELECT h."Id" FROM "Habits" h WHERE h."HabitId" = ANY ($1)',
    'SELECT h.*, g.* FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"',
    'SELECT * FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"',
    'SELECT g.* FROM "Habits" h JOIN "Goals" g ON g."HabitId" = h."Id"',
    'SELECT h."Id", (SELECT g."Name" FROM "Goals" g WHERE g."HabitId" = h."Id" LIMIT 1) FROM "Habits" h WHERE h."UserId" = $1',
    'SELECT h.* FROM "Habits" AS h',
  ]
  const COMPARED_KEYS = ["projectionColumns", "projectedBytesPerRow", "monthlyEgressBytes", "tableFraction", "bounded", "userScoped", "rowsPerCall", "callsPerMonth", "intervalSeconds"]
  const divergent = equivalenceCorpus.filter((queryShape) => {
    const { fromLib, fromWorkflow } = probe(queryShape)
    return COMPARED_KEYS.some((key) => JSON.stringify(fromLib[key]) !== JSON.stringify(fromWorkflow[key]))
      || JSON.stringify([...fromLib.signals].sort()) !== JSON.stringify([...fromWorkflow.signals].sort())
  })
  T(
    "performance-measurement: the module and the inlined workflow copy agree on every corpus query",
    divergent.length === 0,
    `diverged on: ${JSON.stringify(divergent)}`,
  )
  const distinct = probe('SELECT DISTINCT h."Id", h."UserId" FROM "Habits" h')
  T("performance-measurement: DISTINCT is not counted as a column", distinct.fromLib.projectionColumns === 2, String(distinct.fromLib.projectionColumns))

  /** A root-scoped enumeration covering every column IS the whole row, and is charged exactly the
   * measured width, never more. This is the real shape of the unpaginated habit list in
   * `pg_stat_statements`: named columns, not `h.*`. */
  const overCounted = probe('SELECT a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v FROM "Habits" h')
  T(
    "performance-measurement: a root enumeration covering the row is charged the row width, never more",
    overCounted.fromLib.projectedBytesPerRow === 400 && overCounted.fromWorkflow.projectedBytesPerRow === 400,
    JSON.stringify({ lib: overCounted.fromLib.projectedBytesPerRow, workflow: overCounted.fromWorkflow.projectedBytesPerRow }),
  )

  /**
   * P1, same pass: reject or merge duplicate measured-query mappings. `new Map(mappings.map(...))`
   * silently kept the LAST entry, so two mappings that disagree about executionContext produced
   * opposite signals and whichever the agent emitted second decided the finding.
   */
  const baseMeasurement = resolvePerformanceMeasurement(availableInput())
  const duplicateOf = (overrides) => [...measuredMappings(), { ...measuredMappings()[0], ...overrides }]
  let conflictError = null
  try {
    applyMeasuredQueryContexts(baseMeasurement, duplicateOf({ executionContext: "background" }))
  } catch (error) {
    conflictError = error
  }
  T(
    "performance-measurement: two mappings that disagree about execution context are REFUSED, not silently resolved",
    conflictError !== null && /mapped twice and the mappings disagree/.test(conflictError.message) && conflictError.message.includes(measuredMappings()[0].queryId),
    conflictError ? conflictError.message : "no error was thrown, so the later mapping silently won",
  )
  let identicalError = null
  let mergedResult = null
  try {
    mergedResult = applyMeasuredQueryContexts(baseMeasurement, duplicateOf({}))
  } catch (error) {
    identicalError = error
  }
  T(
    "performance-measurement: an identical duplicate mapping is merged rather than refused",
    identicalError === null && mergedResult?.verdict === "MEASURED",
    identicalError ? identicalError.message : JSON.stringify(mergedResult?.verdict),
  )
  let missingError = null
  try {
    applyMeasuredQueryContexts(baseMeasurement, measuredMappings().slice(1))
  } catch (error) {
    missingError = error
  }
  T(
    "performance-measurement: an unmapped query names itself instead of dying on a bare TypeError",
    missingError !== null && /has no source mapping/.test(missingError.message),
    missingError ? missingError.message : "no error was thrown",
  )
}
