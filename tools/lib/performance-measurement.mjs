const DAYS_PER_MONTH = 365.25 / 12
const DEFAULT_BACKGROUND_BUDGET_BYTES = 50 * 1024 * 1024
const DEFAULT_LARGE_TABLE_FRACTION = 0.25
const EXECUTION_CONTEXTS = new Set(["request", "background"])
const CONTEXT_SIGNAL_KINDS = new Set(["unbounded-user-list", "background-sweep-budget"])
const OUTER_CLAUSE_KEYWORDS = new Set([
  "cross", "except", "fetch", "for", "full", "group", "having", "inner", "intersect", "join",
  "left", "limit", "offset", "order", "right", "union", "where", "window",
])
const isKeyword = (token, keyword) => token?.type === "identifier" && token.quoted !== true && token.lower === keyword

const positiveNumber = (value, field) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a positive number`)
  return value
}

const nonNegativeNumber = (value, field) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number`)
  return value
}

const unknownSql = (reason) => ({
  status: "unknown",
  reason,
  projectionColumns: null,
  projectsRootWholeRow: null,
  bounded: null,
  userScoped: null,
})

const readQuoted = (sql, start, quote) => {
  let value = ""
  for (let index = start + 1; index < sql.length; index++) {
    if (sql[index] !== quote) {
      value += sql[index]
      continue
    }
    if (sql[index + 1] === quote) {
      value += quote
      index++
      continue
    }
    return { end: index + 1, value }
  }
  return null
}

/** A small PostgreSQL lexer. Unsupported or malformed input returns a reason instead of a guess. */
const tokenizeSql = (sql) => {
  const tokens = []
  for (let index = 0; index < sql.length;) {
    const character = sql[index]
    if (/\s/.test(character)) { index++; continue }
    if (character === "-" && sql[index + 1] === "-") {
      const lineEnd = sql.indexOf("\n", index + 2)
      index = lineEnd < 0 ? sql.length : lineEnd + 1
      continue
    }
    if (character === "/" && sql[index + 1] === "*") {
      const commentEnd = sql.indexOf("*/", index + 2)
      if (commentEnd < 0) return { reason: "unterminated block comment" }
      index = commentEnd + 2
      continue
    }
    if (character === "\"") {
      const quoted = readQuoted(sql, index, "\"")
      if (!quoted) return { reason: "unterminated quoted identifier" }
      tokens.push({ type: "identifier", value: quoted.value, lower: quoted.value.toLowerCase(), quoted: true })
      index = quoted.end
      continue
    }
    if (character === "'") {
      const quoted = readQuoted(sql, index, "'")
      if (!quoted) return { reason: "unterminated string literal" }
      tokens.push({ type: "literal", value: quoted.value })
      index = quoted.end
      continue
    }
    const parameter = /^\$\d+/.exec(sql.slice(index))?.[0]
    if (parameter) {
      tokens.push({ type: "parameter", value: parameter })
      index += parameter.length
      continue
    }
    const word = /^[A-Za-z_][A-Za-z_0-9$]*/.exec(sql.slice(index))?.[0]
    if (word) {
      tokens.push({ type: "identifier", value: word, lower: word.toLowerCase(), quoted: false })
      index += word.length
      continue
    }
    const number = /^\d+(?:\.\d+)?/.exec(sql.slice(index))?.[0]
    if (number) {
      tokens.push({ type: "literal", value: number })
      index += number.length
      continue
    }
    if ("(),.*;".includes(character)) {
      tokens.push({ type: "punctuation", value: character })
      index++
      continue
    }
    if ("=<>!+-/%:^|&~?[]".includes(character)) {
      tokens.push({ type: "operator", value: character })
      index++
      continue
    }
    return { reason: `unsupported SQL character at offset ${index}` }
  }
  return { tokens }
}

const topLevelDepths = (tokens) => {
  const depths = []
  let depth = 0
  for (const token of tokens) {
    depths.push(depth)
    if (token.value === "(") depth++
    if (token.value === ")") {
      depth--
      if (depth < 0) return null
    }
  }
  return depth === 0 ? depths : null
}

const splitProjection = (tokens, depths, start, end) => {
  const expressions = []
  let expressionStart = start
  for (let index = start; index < end; index++) {
    if (depths[index] === 0 && tokens[index].value === ",") {
      if (index === expressionStart) return null
      expressions.push(tokens.slice(expressionStart, index))
      expressionStart = index + 1
    }
  }
  if (expressionStart === end) return null
  expressions.push(tokens.slice(expressionStart, end))
  return expressions
}

const directColumn = (expression) => {
  const asIndex = expression.findIndex((token) => isKeyword(token, "as"))
  const value = asIndex < 0 ? expression : expression.slice(0, asIndex)
  if (value.length === 1 && value[0].type === "identifier") {
    return { qualifier: null, column: value[0].lower, star: false }
  }
  if (
    value.length === 3
    && value[0].type === "identifier"
    && value[1].value === "."
    && (value[2].type === "identifier" || value[2].value === "*")
  ) {
    return { qualifier: value[0].lower, column: value[2].lower ?? value[2].value, star: value[2].value === "*" }
  }
  if (value.length === 1 && value[0].value === "*") return { qualifier: null, column: "*", star: true }
  return null
}

const skipSelectModifier = (tokens, depths, start, end) => {
  if (isKeyword(tokens[start], "all")) return start + 1
  if (!isKeyword(tokens[start], "distinct")) return start
  if (!isKeyword(tokens[start + 1], "on")) return start + 1
  if (tokens[start + 2]?.value !== "(") return null
  for (let index = start + 3; index < end; index++) {
    if (tokens[index].value === ")" && depths[index] === 1) return index + 1
  }
  return null
}

/** PostgreSQL accepts comma-separated FROM items, which join exactly like an explicit JOIN. Bounding
 * the scan to the FROM clause keeps a GROUP BY or ORDER BY list from reading as a second source. */
const hasCommaJoin = (tokens, depths, fromIndex) => {
  for (let index = fromIndex + 1; index < tokens.length; index++) {
    if (depths[index] !== 0) continue
    if (tokens[index].type === "identifier" && !tokens[index].quoted && OUTER_CLAUSE_KEYWORDS.has(tokens[index].lower)) return false
    if (tokens[index].value === ",") return true
  }
  return false
}

const rootSource = (tokens, depths, fromIndex) => {
  let index = fromIndex + 1
  if (tokens[index]?.type !== "identifier") return null
  const names = [tokens[index].lower]
  index++
  while (tokens[index]?.value === "." && tokens[index + 1]?.type === "identifier") {
    names.push(tokens[index + 1].lower)
    index += 2
  }
  let alias = names.at(-1)
  if (isKeyword(tokens[index], "as")) {
    if (tokens[index + 1]?.type !== "identifier") return null
    alias = tokens[index + 1].lower
  } else if (
    tokens[index]?.type === "identifier"
    && depths[index] === 0
    && (tokens[index].quoted || !OUTER_CLAUSE_KEYWORDS.has(tokens[index].lower))
  ) {
    alias = tokens[index].lower
  }
  return { alias }
}

/**
 * Reads only the SELECT facts the performance audit needs. A shape outside this conservative
 * grammar reports unknown; callers never reinterpret unknown as zero, false, or one column.
 */
export const analyzeQueryShape = (queryShape, columnCount) => {
  const lexed = tokenizeSql(queryShape)
  if (!lexed.tokens) return unknownSql(lexed.reason)
  const tokens = lexed.tokens
  while (tokens.at(-1)?.value === ";") tokens.pop()
  if (tokens.some((token) => token.value === ";")) return unknownSql("multiple SQL statements are unsupported")
  const depths = topLevelDepths(tokens)
  if (!depths) return unknownSql("unbalanced parentheses")
  if (!isKeyword(tokens[0], "select")) return unknownSql("only a top-level SELECT statement is supported")

  const fromIndex = tokens.findIndex((token, index) => index > 0 && depths[index] === 0 && isKeyword(token, "from"))
  if (fromIndex < 0) return unknownSql("top-level SELECT has no FROM clause")
  if (tokens.some((token, index) => depths[index] === 0 && ["union", "intersect", "except"].some((keyword) => isKeyword(token, keyword)))) {
    return unknownSql("set operations are unsupported")
  }
  const projectionStart = skipSelectModifier(tokens, depths, 1, fromIndex)
  if (projectionStart == null || projectionStart >= fromIndex) return unknownSql("SELECT modifier is incomplete")
  const expressions = splitProjection(tokens, depths, projectionStart, fromIndex)
  if (!expressions) return unknownSql("SELECT list is incomplete")
  const root = rootSource(tokens, depths, fromIndex)
  if (!root) return unknownSql("root FROM source is unsupported")

  const joined = tokens.some((token, index) => depths[index] === 0 && isKeyword(token, "join"))
    || hasCommaJoin(tokens, depths, fromIndex)
  const columns = expressions.map(directColumn)
  const starColumns = columns.filter((column) => column?.star)
  const knownColumnCount = Number.isFinite(columnCount) && columnCount > 0 ? columnCount : null
  let projectionColumns = expressions.length
  if (expressions.length > (knownColumnCount ?? Number.POSITIVE_INFINITY)) projectionColumns = null
  if (starColumns.length > 0) {
    const onlyStar = expressions.length === 1 ? starColumns[0] : null
    const rootStar = onlyStar && (onlyStar.qualifier === root.alias || (!joined && onlyStar.qualifier == null))
    projectionColumns = rootStar ? knownColumnCount : null
  }

  const rootColumns = columns.filter((column) => column && !column.star && (
    column.qualifier === root.alias || (!joined && column.qualifier == null)
  ))
  const uniqueRootColumns = new Set(rootColumns.map((column) => column.column))
  const explicitWholeRow = knownColumnCount != null
    && rootColumns.length === expressions.length
    && uniqueRootColumns.size === knownColumnCount
    && rootColumns.length === knownColumnCount
  const onlyStar = expressions.length === 1 ? starColumns[0] : null
  const starWholeRow = Boolean(knownColumnCount && onlyStar && (
    onlyStar.qualifier === root.alias || (!joined && onlyStar.qualifier == null)
  ))
  const outerWords = tokens.filter((token, index) => depths[index] === 0 && token.type === "identifier")

  return {
    status: "parsed",
    reason: null,
    projectionColumns,
    projectsRootWholeRow: starWholeRow || explicitWholeRow,
    bounded: outerWords.some((token, index) => (
      isKeyword(token, "limit") && !isKeyword(outerWords[index + 1], "all")
    ) || (
      isKeyword(token, "fetch") && ["first", "next"].some((keyword) => isKeyword(outerWords[index + 1], keyword))
    )),
    userScoped: tokens.some((token) => token.type === "identifier" && token.lower === "userid"),
  }
}

const normalizeTableStats = (tableStats) => (tableStats ?? []).map((entry, index) => ({
  table: String(entry.table || ""),
  /** An empty public table reports a legitimate `n_live_tup` of 0. Requiring a positive count turned
   * one empty table into `CODE_ONLY` for the WHOLE measurement, which is a readiness verdict lost to
   * a table nobody has written to yet. */
  liveRows: nonNegativeNumber(entry.liveRows, `tableStats[${index}].liveRows`),
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
  const queryAnalysis = analyzeQueryShape(queryShape, table?.columnCount)
  /** Dividing by an empty table's 0 rows is Infinity, which would fire large-table-fraction on every
   * query against it. An empty table has no meaningful fraction, so the metric is unknown. */
  const tableFraction = table && table.liveRows > 0 ? rowsPerCall / table.liveRows : null
  const projectionColumns = queryAnalysis.projectionColumns
  /**
   * Egress is what the query SENDS, which is its projection, not the width of the table row.
   * `bytesPerRow` comes from pg_stats and describes the whole row, so charging every query the full
   * width overstates a narrow projection in direct proportion to how well it is written:
   * `select "Id", "UserId" from "Habits"` on a 29-column table was billed about 15x its real
   * egress, which is exactly backwards for a signal meant to find unbounded reads.
   *
   * So this metric is EXACT or it is UNKNOWN, and it is never estimated. Charging the full row width
   * overstated narrow projections; scaling by the fraction of columns selected then understated them,
   * because Postgres column widths differ by orders of magnitude and one `text` column can outweigh
   * twenty `int` ones. Both readings were wrong in a way that moved the top finding and therefore the
   * readiness verdict, and each replaced the other. Only per-column `pg_stats.avg_width`, which this
   * input does not carry, could give a real projected width.
   *
   * A projection that provably covers the whole row IS the measured row width, so those queries keep
   * an exact figure. That is the shape that actually causes an egress incident, and the unpaginated
   * `Habits` read behind the 112% Supabase overage is one of them. A narrower projection reports
   * `null`, which sorts last in the egress ranking and fires no budget signal, rather than carrying a
   * number nobody can defend. `unbounded-user-list`, the principal signal, reads `bounded` and is
   * unaffected either way.
   */
  const projectedBytesPerRow = bytesPerRow == null || queryAnalysis.projectsRootWholeRow !== true ? null : bytesPerRow
  const monthlyEgressBytes = projectedBytesPerRow == null ? null : rows / windowDays * DAYS_PER_MONTH * projectedBytesPerRow
  const signals = []

  /** full-entity-projection fails closed: an unknown projection emits no signal. */
  if (queryAnalysis.status === "parsed" && table?.columnCount && projectionColumns === table.columnCount) {
    signals.push("full-entity-projection")
  }
  /** large-table-fraction also fails closed. Without a parsed root SELECT, the supplied root table
   * cannot be tied to the SQL strongly enough to raise a finding from its row count. */
  if (queryAnalysis.status === "parsed" && tableFraction != null && tableFraction >= thresholds.largeTableFraction) {
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
    queryShapeStatus: queryAnalysis.status,
    queryShapeReason: queryAnalysis.reason,
    bounded: queryAnalysis.bounded,
    userScoped: queryAnalysis.userScoped,
    signals,
  }
}

const unavailablePerformanceMeasurement = (reason) => ({
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
    return unavailablePerformanceMeasurement(String(input?.reason || "production measurement was not supplied"))
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
    return unavailablePerformanceMeasurement(`production measurement was invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const completeMeasuredMapping = (mapping) => (
  typeof mapping?.queryId === "string"
  && mapping.queryId.trim().length > 0
  && typeof mapping.location === "string"
  && mapping.location.trim().length > 0
  && EXECUTION_CONTEXTS.has(mapping.executionContext)
)

function performanceMeasurementPromptRankings(measurement, limit = 20) {
  const rankedByMonthlyEgress = (measurement.egressRanking ?? []).slice(0, limit)
  const rankedByRows = (measurement.rowsRanking ?? []).slice(0, limit)
  const queryIds = new Set(
    [...rankedByMonthlyEgress, ...rankedByRows].map((query) => query.queryId),
  )
  return { rankedByMonthlyEgress, rankedByRows, queryIds }
}

export function measuredHotpathMappingFailure(result, measurement) {
  if (!result) return "measured production hot paths could not be mapped to API source"

  const mappings = Array.isArray(result.mappings) ? result.mappings : []
  const completeMappings = mappings.filter(completeMeasuredMapping)
  if (completeMappings.length === 0) return "measured production hot-path mapping was empty"

  const mappedQueryIds = new Set(completeMappings.map((mapping) => mapping.queryId))
  const missingQueryIds = [...performanceMeasurementPromptRankings(measurement).queryIds]
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
  const promptedQueryIds = performanceMeasurementPromptRankings(measurement).queryIds
  const rowsRanking = measurement.rowsRanking.map((query) => {
    const mapping = mappingByQueryId.get(query.queryId)
    /** An unmapped query used to reach `mapping.executionContext` and die on a bare TypeError that
     * named neither the query nor the missing mapping. */
    if (!mapping) {
      if (promptedQueryIds.has(query.queryId)) {
        throw new Error(`measured query ${query.queryId} has no source mapping, so its execution context is unknown`)
      }
      return query
    }
    const signals = query.signals.filter((kind) => !CONTEXT_SIGNAL_KINDS.has(kind))
    /** unbounded-user-list fails closed: unknown boundedness is not treated as unbounded. */
    if (mapping.executionContext === "request" && query.bounded === false) signals.push("unbounded-user-list")
    /** background-sweep-budget fails closed: unreadable or non-whole-row projections have null
     * egress, so they cannot cross the budget on an invented number. */
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
  const { rankedByMonthlyEgress, rankedByRows, queryIds } = performanceMeasurementPromptRankings(measurement, limit)

  return JSON.stringify({
    verdict: measurement.verdict,
    statsReset: measurement.statsReset,
    windowDays: measurement.windowDays,
    backgroundBudgetBytes: measurement.thresholds.backgroundBudgetBytes,
    largeTableFraction: measurement.thresholds.largeTableFraction,
    accountSkew: measurement.accountSkew,
    tableStats: measurement.tableStats,
    rankedByMonthlyEgress,
    rankedByRows,
    signals: measurement.signals.filter((signal) => queryIds.has(signal.queryId)),
  })
}

const MEASURED_METRIC_KEYS = ["calls", "rowsPerCall", "bytesPerRow", "callsPerMonth", "monthlyEgressBytes", "tableFraction", "intervalSeconds"]

/**
 * The ONE place a performance finding may acquire a measured metric, applied at EVERY merge.
 *
 * The findings schema lets any finder supply `monthlyEgressBytes`, and the final sorter trusts it.
 * Only the dedicated mapper's findings used to pass through here, so another agent could omit the
 * metric and demote the real highest-egress issue, or invent one and become the top finding that
 * drives ticket priority. Measurement is authoritative; an agent's copy of it is not evidence.
 *
 *   known queryId    overwrite every metric from the measurement, whatever the agent said
 *   unknown queryId  invented or miscopied. Strip the id AND the metrics, keep the prose
 *   no queryId       nothing ties it to a measured statement, so strip any metric it supplied
 */
export function attachPerformanceMetrics(findings, measurement) {
  if (!measurement) return findings
  /**
   * CODE_ONLY is the MOST dangerous path to trust, not the safest. With no measurement there is
   * nothing to overwrite an agent's numbers with, and the skeptic prompt reads any finding carrying
   * a `queryId` as normalized production evidence, so an unmeasured run could rank and ticket
   * invented egress as measured fact. Strip it all.
   */
  if (measurement.status !== "available") {
    return findings.map((finding) => {
      const stripped = { ...finding }
      for (const key of MEASURED_METRIC_KEYS) delete stripped[key]
      delete stripped.queryId
      return stripped
    })
  }
  const queryById = new Map(measurement.rowsRanking.map((entry) => [entry.queryId, entry]))
  return findings.map((finding) => {
    const claimedQueryId = String(finding.queryId || "")
    const measured = claimedQueryId ? queryById.get(claimedQueryId) : null
    if (measured) {
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
    }
    const stripped = { ...finding }
    for (const key of MEASURED_METRIC_KEYS) delete stripped[key]
    if (claimedQueryId) delete stripped.queryId
    return stripped
  })
}
