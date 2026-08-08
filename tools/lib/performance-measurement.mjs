const DAYS_PER_MONTH = 365.25 / 12
const DEFAULT_BACKGROUND_BUDGET_BYTES = 50 * 1024 * 1024
const DEFAULT_LARGE_TABLE_FRACTION = 0.25
const EXECUTION_CONTEXTS = new Set(["request", "background"])
const CONTEXT_SIGNAL_KINDS = new Set(["unbounded-user-list", "background-sweep-budget"])

const positiveNumber = (value, field) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a positive number`)
  return value
}

const nonNegativeNumber = (value, field) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`)
  return value
}

const selectedColumnCount = (queryShape) => {
  const select = /^\s*select\s+([\s\S]+?)\s+from\s+/i.exec(queryShape)?.[1]
  if (!select) return null
  return select.split(",").length
}

const isBoundedQuery = (queryShape) => /\b(?:limit|fetch\s+(?:first|next))\b/i.test(queryShape)

const isUserScopedQuery = (queryShape) => /[".]UserId\b/i.test(queryShape)

const normalizeTableStats = (tableStats) => (tableStats ?? []).map((entry, index) => ({
  table: String(entry.table || ""),
  liveRows: positiveNumber(entry.liveRows, `tableStats[${index}].liveRows`),
  columnCount: entry.columnCount == null ? null : positiveNumber(entry.columnCount, `tableStats[${index}].columnCount`),
  seqScan: entry.seqScan == null ? null : nonNegativeNumber(entry.seqScan, `tableStats[${index}].seqScan`),
  seqTupRead: entry.seqTupRead == null ? null : nonNegativeNumber(entry.seqTupRead, `tableStats[${index}].seqTupRead`),
}))

const analyzeQuery = (entry, index, windowDays, tableByName, thresholds) => {
  const calls = positiveNumber(entry.calls, `queryStats[${index}].calls`)
  const rows = nonNegativeNumber(entry.rows, `queryStats[${index}].rows`)
  const bytesPerRow = entry.bytesPerRow == null ? null : positiveNumber(entry.bytesPerRow, `queryStats[${index}].bytesPerRow`)
  const queryShape = String(entry.queryShape || "")
  if (!queryShape) throw new Error(`queryStats[${index}].queryShape must be a non-empty string`)
  const queryId = String(entry.queryId || "")
  if (!queryId) throw new Error(`queryStats[${index}].queryId must be a non-empty string`)

  const rowsPerCall = rows / calls
  const callsPerMonth = calls / windowDays * DAYS_PER_MONTH
  const monthlyEgressBytes = bytesPerRow == null ? null : rows / windowDays * DAYS_PER_MONTH * bytesPerRow
  const intervalSeconds = windowDays * 86400 / calls
  const rootTable = String(entry.rootTable || "")
  const table = tableByName.get(rootTable)
  const tableFraction = table ? rowsPerCall / table.liveRows : null
  const projectionColumns = selectedColumnCount(queryShape)
  const userScoped = isUserScopedQuery(queryShape)
  const bounded = isBoundedQuery(queryShape)
  const signals = []

  if (table?.columnCount && projectionColumns != null && projectionColumns >= table.columnCount) {
    signals.push("full-entity-projection")
  }
  if (tableFraction != null && tableFraction >= thresholds.largeTableFraction) {
    signals.push("large-table-fraction")
  }

  return {
    queryId,
    roleName: String(entry.roleName || "postgres"),
    queryShape,
    rootTable,
    calls,
    rows,
    rowsPerCall,
    bytesPerRow,
    callsPerMonth,
    monthlyEgressBytes,
    intervalSeconds,
    tableFraction,
    projectionColumns,
    bounded,
    userScoped,
    signals,
  }
}

const unavailable = (reason) => ({
  status: "unavailable",
  verdict: "CODE_ONLY",
  reason,
  statsReset: null,
  windowDays: null,
  rowsRanking: [],
  egressRanking: [],
  tableStats: [],
  accountSkew: null,
  signals: [],
})

export function resolvePerformanceMeasurement(input, options = {}) {
  if (!input || input.status !== "available") {
    return unavailable(String(input?.reason || "production measurement was not supplied"))
  }

  try {
    const windowDays = positiveNumber(input.windowDays, "windowDays")
    const tableStats = normalizeTableStats(input.tableStats)
    const tableByName = new Map(tableStats.map((entry) => [entry.table, entry]))
    const thresholds = {
      backgroundBudgetBytes: positiveNumber(
        options.backgroundBudgetBytes ?? input.backgroundBudgetBytes ?? DEFAULT_BACKGROUND_BUDGET_BYTES,
        "backgroundBudgetBytes",
      ),
      largeTableFraction: positiveNumber(
        options.largeTableFraction ?? input.largeTableFraction ?? DEFAULT_LARGE_TABLE_FRACTION,
        "largeTableFraction",
      ),
    }
    const queries = (input.queryStats ?? []).map((entry, index) =>
      analyzeQuery(entry, index, windowDays, tableByName, thresholds))
    if (queries.length === 0) throw new Error("queryStats must contain at least one statement")

    const rowsRanking = [...queries].sort((left, right) => right.rows - left.rows)
    const egressRanking = [...queries].sort((left, right) =>
      (right.monthlyEgressBytes ?? -1) - (left.monthlyEgressBytes ?? -1))
    const signals = queries.flatMap((query) => query.signals.map((kind) => ({
      kind,
      queryId: query.queryId,
      rowsPerCall: query.rowsPerCall,
      monthlyEgressBytes: query.monthlyEgressBytes,
      tableFraction: query.tableFraction,
      intervalSeconds: query.intervalSeconds,
    })))

    return {
      status: "available",
      verdict: "MEASURED",
      reason: null,
      statsReset: String(input.statsReset || ""),
      windowDays,
      rowsRanking,
      egressRanking,
      tableStats,
      accountSkew: input.accountSkew ?? null,
      thresholds,
      signals,
    }
  } catch (error) {
    return unavailable(`production measurement was invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const completeMeasuredMapping = (mapping) => (
  typeof mapping?.queryId === "string"
  && mapping.queryId.trim().length > 0
  && typeof mapping.location === "string"
  && mapping.location.trim().length > 0
  && EXECUTION_CONTEXTS.has(mapping.executionContext)
)

export function measuredHotpathMappingFailure(result, measurement) {
  if (!result) return "measured production hot paths could not be mapped to API source"

  const mappings = Array.isArray(result.mappings) ? result.mappings : []
  const completeMappings = mappings.filter(completeMeasuredMapping)
  if (completeMappings.length === 0) return "measured production hot-path mapping was empty"

  const mappedQueryIds = new Set(completeMappings.map((mapping) => mapping.queryId))
  const missingQueryIds = measurement.rowsRanking
    .map((query) => query.queryId)
    .filter((queryId) => !mappedQueryIds.has(queryId))
  if (missingQueryIds.length > 0) {
    return `measured production hot-path mapping was incomplete; missing query IDs: ${missingQueryIds.join(", ")}`
  }

  return null
}

export function applyMeasuredQueryContexts(measurement, mappings) {
  if (measurement.status !== "available") return measurement

  const mappingByQueryId = new Map(mappings.map((mapping) => [mapping.queryId, mapping]))
  const rowsRanking = measurement.rowsRanking.map((query) => {
    const mapping = mappingByQueryId.get(query.queryId)
    const signals = query.signals.filter((kind) => !CONTEXT_SIGNAL_KINDS.has(kind))
    if (mapping.executionContext === "request" && !query.bounded) signals.push("unbounded-user-list")
    if (
      mapping.executionContext === "background"
      && query.monthlyEgressBytes != null
      && query.monthlyEgressBytes >= measurement.thresholds.backgroundBudgetBytes
    ) {
      signals.push("background-sweep-budget")
    }
    return {
      ...query,
      sourceLocation: mapping.location,
      executionContext: mapping.executionContext,
      signals,
    }
  })
  const queryById = new Map(rowsRanking.map((query) => [query.queryId, query]))
  const egressRanking = measurement.egressRanking.map((query) => queryById.get(query.queryId))
  const signals = rowsRanking.flatMap((query) => query.signals.map((kind) => ({
    kind,
    queryId: query.queryId,
    rowsPerCall: query.rowsPerCall,
    monthlyEgressBytes: query.monthlyEgressBytes,
    tableFraction: query.tableFraction,
    intervalSeconds: query.intervalSeconds,
  })))

  return { ...measurement, rowsRanking, egressRanking, signals }
}

export function performanceMeasurementPrompt(measurement, limit = 20) {
  if (measurement.status !== "available") {
    return `Production measurement unavailable. Performance verdict is CODE_ONLY. Reason: ${measurement.reason}`
  }

  return JSON.stringify({
    verdict: measurement.verdict,
    statsReset: measurement.statsReset,
    windowDays: measurement.windowDays,
    backgroundBudgetBytes: measurement.thresholds.backgroundBudgetBytes,
    largeTableFraction: measurement.thresholds.largeTableFraction,
    accountSkew: measurement.accountSkew,
    tableStats: measurement.tableStats,
    rankedByMonthlyEgress: measurement.egressRanking.slice(0, limit),
    rankedByRows: measurement.rowsRanking.slice(0, limit),
    signals: measurement.signals,
  })
}

export function attachPerformanceMetrics(findings, measurement) {
  if (measurement.status !== "available") return findings
  const queryById = new Map(measurement.rowsRanking.map((entry) => [entry.queryId, entry]))
  return findings.map((finding) => {
    const measured = queryById.get(String(finding.queryId || ""))
    if (!measured) return finding
    return {
      ...finding,
      calls: measured.calls,
      rowsPerCall: measured.rowsPerCall,
      bytesPerRow: measured.bytesPerRow,
      callsPerMonth: measured.callsPerMonth,
      monthlyEgressBytes: measured.monthlyEgressBytes,
      tableFraction: measured.tableFraction,
      intervalSeconds: measured.intervalSeconds,
    }
  })
}
