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

/**
 * How many columns a SELECT list actually projects.
 *
 * `select.split(",").length` was wrong in both directions and each error pushed the same way, so a
 * badly written query scored better than a careful one:
 *   `select *`                     counted 1 column, then never matched full-entity-projection
 *   `select coalesce(a, b), c`     counted 3 columns for 2, then matched it spuriously
 *
 * A star projects the whole row, so it resolves to the table's column count when that is known and
 * to null when it is not. Null means "unknown", never "one", and every caller treats it that way.
 */
const selectedColumnCount = (queryShape, columnCount) => {
  const select = /^\s*select\s+([\s\S]+?)\s+from\s+/i.exec(queryShape)?.[1]
  if (!select) return null
  const list = select.replace(/^\s*(?:distinct\s+on\s*\([\s\S]*?\)|distinct|all)\s+/i, "").trim()
  if (list === "") return null
  let depth = 0
  let current = ""
  const parts = []
  for (const character of list) {
    if (character === "(") depth++
    else if (character === ")") depth--
    if (character === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += character
  }
  parts.push(current)
  const columns = parts.map((part) => part.trim()).filter(Boolean)
  if (columns.length === 0) return null
  /** A bare or qualified star expands to every column, so the width is the table's, not one. */
  if (columns.some((column) => column === "*" || /(?:^|\.)\*$/.test(column))) {
    return Number.isFinite(columnCount) && columnCount > 0 ? columnCount : null
  }
  return columns.length
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
  const intervalSeconds = windowDays * 86400 / calls
  const rootTable = String(entry.rootTable || "")
  const table = tableByName.get(rootTable)
  const tableFraction = table ? rowsPerCall / table.liveRows : null
  const projectionColumns = selectedColumnCount(queryShape, table?.columnCount)
  /**
   * Egress is what the query SENDS, which is its projection, not the width of the table row.
   * `bytesPerRow` comes from pg_stats and describes the whole row, so charging every query the full
   * width overstates a narrow projection in direct proportion to how well it is written:
   * `select "Id", "UserId" from "Habits"` on a 29-column table was billed about 15x its real
   * egress, which is exactly backwards for a signal meant to find unbounded reads.
   *
   * Scaling by columns is an approximation and it is named as one: column widths differ, so a
   * projection of two `text` columns is not one fifteenth of a 29-column row. It is right in the
   * direction that matters and never charges MORE than the measured row width.
   */
  const projectedBytesPerRow = bytesPerRow == null
    ? null
    : projectionColumns && table?.columnCount > 0
      ? bytesPerRow * Math.min(1, projectionColumns / table.columnCount)
      : bytesPerRow
  const monthlyEgressBytes = projectedBytesPerRow == null ? null : rows / windowDays * DAYS_PER_MONTH * projectedBytesPerRow
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
    projectedBytesPerRow,
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

/**
 * One mapping per measured query, or a refusal that names the disagreement.
 *
 * `new Map(mappings.map(...))` silently kept the LAST entry for a repeated queryId. Two mappings
 * that disagree about executionContext produce opposite signals, `request` raising
 * unbounded-user-list and `background` raising background-sweep-budget, so whichever the agent
 * happened to emit second decided the finding and nothing recorded that there had been a choice.
 *
 * Identical duplicates are merged, because emitting the same mapping twice is noise and not a
 * conflict. Anything that actually disagrees throws, because guessing which one is right is the
 * failure this whole measured path exists to remove.
 */
function indexMeasuredMappings(mappings) {
  const byQueryId = new Map()
  for (const mapping of mappings) {
    const existing = byQueryId.get(mapping.queryId)
    if (!existing) {
      byQueryId.set(mapping.queryId, mapping)
      continue
    }
    if (existing.executionContext !== mapping.executionContext || existing.location !== mapping.location) {
      throw new Error(
        `measured query ${mapping.queryId} was mapped twice and the mappings disagree: `
        + `${existing.executionContext} at ${existing.location} against ${mapping.executionContext} at ${mapping.location}`,
      )
    }
  }
  return byQueryId
}

export function applyMeasuredQueryContexts(measurement, mappings) {
  if (measurement.status !== "available") return measurement

  const mappingByQueryId = indexMeasuredMappings(mappings)
  const rowsRanking = measurement.rowsRanking.map((query) => {
    const mapping = mappingByQueryId.get(query.queryId)
    /** An unmapped query used to reach `mapping.executionContext` and die on a bare TypeError that
     * named neither the query nor the missing mapping. */
    if (!mapping) throw new Error(`measured query ${query.queryId} has no source mapping, so its execution context is unknown`)
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
