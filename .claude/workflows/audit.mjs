export const meta = {
  name: 'audit',
  description: 'Repo-wide audit engine — Haiku fan-out per surface + Haiku adversarial verify + loop-until-dry; returns verified findings for Opus synthesis. Kind: security | tests | performance | code-quality.',
  phases: [
    { title: 'Measure', detail: 'production rows, calls, table scans, skew, and byte-weighted egress' },
    { title: 'Find', detail: 'one Haiku finder per surface, scoped by kind' },
    { title: 'Verify', detail: 'one Haiku skeptic per serious finding — default refuted' },
    { title: 'Complete', detail: 'completeness critic + gap finders, loop until dry' },
  ],
}

// <generated:performance-measurement>
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
const analyzeQueryShape = (queryShape, columnCount) => {
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
  /** Over any join, comma-separated or explicit, a projected expression may belong to another
   * relation, so counting expressions and comparing that count against the ROOT table's column
   * count reads a cross-relation width as the root entity's own. Only a projection whose every
   * column names the root alias is attributable; anything else is unknown rather than wrong. */
  if (joined && !columns.every((column) => column && !column.star && column.qualifier === root.alias)) {
    projectionColumns = null
  }
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

function resolvePerformanceMeasurement(input, options = {}) {
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

function measuredHotpathMappingFailure(result, measurement) {
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

function applyMeasuredQueryContexts(measurement, mappings) {
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

function performanceMeasurementPrompt(measurement, limit = 20) {
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
function attachPerformanceMetrics(findings, measurement) {
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
// </generated:performance-measurement>

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
          queryId: { type: 'string' },
          calls: { type: 'number' },
          rowsPerCall: { type: 'number' },
          bytesPerRow: { type: 'number' },
          callsPerMonth: { type: 'number' },
          monthlyEgressBytes: { type: 'number' },
          tableFraction: { type: 'number' },
          intervalSeconds: { type: 'number' },
        },
        required: ['severity', 'title', 'location', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const MEASURED_FINDINGS_SCHEMA = {
  ...FINDINGS_SCHEMA,
  properties: {
    mappings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          queryId: { type: 'string' },
          location: { type: 'string' },
          executionContext: { type: 'string' },
        },
        required: ['queryId', 'location', 'executionContext'],
      },
    },
    findings: {
      ...FINDINGS_SCHEMA.properties.findings,
      items: {
        ...FINDINGS_SCHEMA.properties.findings.items,
        required: [...FINDINGS_SCHEMA.properties.findings.items.required, 'queryId'],
      },
    },
  },
  required: ['mappings', 'findings'],
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
    extra: 'For cross-user access, PROVE the query is NOT scoped to the caller userId by citing the exact line. Payment/webhook handlers: verify the signature check exists. AI/MCP tools must derive userId from the session and accept no target-user parameter. Gate-owned, do NOT flag: a controller merely MISSING [Authorize] (Roslyn ORBIT0003 owns presence, but an authenticated handler that acts on a client-supplied id without an ownership check IS in scope), and committed-secret SHAPES (GitGuardian owns those, but a key read per-request instead of set globally, a secret logged or returned in an error, or a token in the wrong store IS in scope).',
    surfaces: [
      { label: 'authz-isolation', repos: 'both', where: 'orbit-api controllers + every CQRS query/command handler in src/Orbit.Application — each must scope its query by the authenticated userId (from the JWT, never a client-controlled field). ALSO report, as an explicit UNVERIFIED item, that the Supabase RLS + anon-grant posture (checklist section A, final bullet) is live-database state you cannot read from the repo: name it so the synthesis runs the three queries rather than assuming it clean.', sections: 'A' },
      { label: 'ai-mcp-scoping', repos: 'api', where: 'the agent/MCP tool handlers in orbit-api (execute_agent_operation_v2, bulk_delete_habits, bulk_log_habits, delete_goal, manage_account, and the per-entity mutators) — each must resolve the caller userId and cannot touch another user rows', sections: 'A, F' },
      { label: 'injection', repos: 'both', where: 'raw or interpolated SQL/EF, dangerouslySetInnerHTML (web), Process.Start, path building from user input', sections: 'B' },
      { label: 'secrets-config', repos: 'both', where: 'hardcoded keys / JWT secrets / connection strings, .env-shaped values in source, debug flags, security headers + CORS in Program.cs and the Extensions', sections: 'C, D' },
      { label: 'ratelimit-ai-abuse', repos: 'both', where: 'rate-limit coverage on auth (send-code / verify-code), password-reset, and the AI/chat endpoints; request-size limits; bot protection (CAPTCHA/Turnstile) on public unauthenticated write forms; prompt-injection and unbounded-cost paths in the AI flow', sections: 'E, F' },
      { label: 'error-web-auth', repos: 'both', where: 'stack traces / DB schema leaked in API responses; web auth cookie flags (httpOnly + sameSite strict + secure); mobile token storage (SecureStore, never AsyncStorage); the auth FAILURE paths (send-code / verify-code / password-reset / signup) for account enumeration, per-account throttling, and single-use expiring tokens', sections: 'G, H, I' },
      { label: 'privacy-data-rights', repos: 'both', where: 'the privacy policy surface (apps/web/app/(public)/privacy + the landing footer link) against the processors the code actually calls; the user-reachable account-deletion and data-export paths; PII in analytics/crash/log payloads (PostHog, Sentry); dependency licenses for copyleft contamination', sections: 'J' },
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
    checklist: `${UI}\\.claude\\skills\\audit-performance\\checklist.md`,
    extra: 'Start from the measured ranking when it is available. Flag ONLY patterns that degrade quadratically/linearly with data or traffic: N+1 queries (missing .Include / projecting after materializing), missing index on a hot Where/OrderBy/FK, a user-scoped list with no Take/pagination, a full-entity load whose consumer reads a few fields, a query returning at least 25% of its table per call, a background sweep above the stated 50 MiB monthly payload budget, sync slow work (HTTP/AI/email/push) inline in a request path, blocking async (.Result/.Wait), IQueryable materialized too early, missing AsNoTracking on hot reads; frontend render thrash, bundle bloat (mobile Metro or a non-Today web route, since the Today web budget is gated), over-eager or stale caching, waterfalls. Every measured finding names calls, rows per call, bytes per row, calls per month, and monthly egress. CONFIRM every index claim against the EF migrations (read them, cite the migration). Gate-owned, do NOT flag: the web LCP/TBT/script-bundle-size budgets on the authed-Today surface (perf.yml owns those), an N+1 regression on the three query shapes already under tests/Orbit.Infrastructure.Tests/Persistence/QueryRoundTripCountTests.cs, and render-thrash patterns react-doctor perf rules already fail on. Do NOT micro-optimize, do NOT over-prescribe memoization/virtualization, do NOT list enterprise-only tuning (note once).',
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
    extra: 'Hunt dead/stale code in all four rubric categories — confirmed dead, verbatim duplicate declarations to dedupe, magic literals drifting from a named constant, and unreachable arbitrary caps/thresholds — and PROVE each with a zero-reference grep (cite the command and its empty result, never guess; live until proven dead). Flag a comment that has drifted into a lie (describes behaviour the code no longer has, or cites a closed issue) — that judgement half is yours even though the comment-policy gates own narration. Flag shallow modules (an interface nearly as complex as its implementation) and pure functions extracted only for testability while the bugs live in the call site; one adapter is a hypothetical seam, two are a real one. Flag independent work serialized for no reason and related updates that can leave state half-applied, when the cleaner structure is obvious. Flag SOLID/clean-arch (functions over the ~50-line soft cap / ~100 hard cap, nesting past ~3), premature abstraction, DRY-at-the-wrong-level, naming (data/info/temp/helper/util as final names, abbreviations), and the DESIGN.md drift on apps/* UI that no lint rule covers (visual hierarchy, semantic-token misuse beyond the gated spacing scale). Explicitly hunt for code-judo opportunities where reframing the state model or data shape deletes whole branches; spaghetti if/else ladders, deeply coupled branching, and flag soup, preferring early returns, lookup tables, or explicit polymorphism as the smallest fitting remedy; thin wrappers and magical abstractions that fail the deletion test because removing them makes complexity vanish, which should be deleted or deepened into a clear boundary; and giant multi-job files, splitting by responsibility or extracting pure helpers while reporting a split that only moves the same tangle as relocation, not simplification. Treat repeated cast or optionality churn as judgement-level structural debt when one better type or one trust-boundary parse removes it, while D11 excludes gate-owned mechanical forms such as as any, as unknown as X, and unjustified null!. Place cross-app duplication in packages/shared, cross-component duplication in apps/<platform>/components, and repeated handler or cross-function logic behind one well-named helper at the narrowest shared layer without lifting one-caller code. Move business logic out of controllers, components, DTOs, and platform adapters into its canonical domain, CQRS, or shared-logic layer. Do NOT flag comment-policy breaks (local/no-comments + ORBIT0001 own those), the spacing scale, console/any, dashes, or copy register; those are gate-owned. Rank by blast-radius x churn, so a smell in a hot handler outranks the same in a stable leaf. Do NOT re-derive security findings (owned by /audit-security), and do NOT re-derive contract or backward-compat drift, which only a diff review can judge.',
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

const GATE_OWNED =
  'D11 boundary: audit ONLY what no gate can check; NEVER emit a finding a gate already fails on. The mechanical layer, owned by gates, is off-limits: ESLint local/* (comment policy, spacing scale, console/any bans, animate-presence), the guards.yml jobs (Dash Ban, Copy Register, Suppressions Ratchet, Expo SDK Pin, Cross-Platform Parity), Roslyn ORBIT0001..0005 (narration comments, redundant tx rollbacks, controller-missing-[Authorize], raw DateTime.UtcNow for user-facing dates, DbSet without entity config), react-doctor.yml (React correctness plus its a11y/perf rules), perf.yml (the web LCP/TBT/bundle budgets), and arch-map.yml. When a concern is half-mechanical, keep ONLY the judgement half and name the gate that owns the other.'

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
  const normalizedScope = String(scope).replaceAll('\\', '/').toLowerCase()
  const pathRepo = normalizedScope.includes('/orbit-api/') || /^(?:\.\/)?(?:src|tests)\//.test(normalizedScope)
    ? 'api'
    : normalizedScope.includes('/orbit-ui-mobile/') || /^(?:\.\/)?(?:apps|packages|tools|\.claude|\.github)\//.test(normalizedScope)
      ? 'ui'
      : null
  if (pathRepo) {
    return all
      .filter((s) => [pathRepo, 'both'].includes(surfaceRepos(s)))
      .map((s) => ({ ...s, where: `${s.where} — but ONLY within the path "${scope}"` }))
  }
  return all.map((s) => ({ ...s, where: `${s.where} — but ONLY within the path "${scope}"` }))
}

function finderPrompt(kind, surface, scope, measurement) {
  const cfg = KIND[kind]
  const sectionNote = surface.sections ? ` (sections ${surface.sections})` : ''
  const measuredContext = kind === 'performance' && isApiSurface(surface)
    ? `Production measurement context: ${performanceMeasurementPrompt(measurement)} Use queryId to tie a code finding to the measured statement. The actual maximum account skew replaces any imagined typical-user size.`
    : ''
  return [
    `Objective: ${kind} audit of the "${surface.label}" surface in ${scopeLabelFor(scope)}.`,
    `Read the rubric/checklist FIRST: ${cfg.checklist}${sectionNote}. It is the contract for what counts and how findings are shaped.`,
    `Where to look: ${surface.where}.`,
    `Repo roots — orbit-ui-mobile: ${UI} · orbit-api: ${API}.`,
    GATE_OWNED,
    cfg.extra,
    measuredContext,
    `For every REAL issue emit a finding with: severity from [${cfg.ladder}]; a one-line title; category (the rubric/checklist dimension); location (repo-relative path:line); evidence (the exact line/command that proves it); rationale (${cfg.rationale}); fix (the concrete change); reference (the CLAUDE.md rule / rubric dimension / checklist section / OWASP item).`,
    `Calibrate to Orbit's solo-dev, pre-scale reality — never inflate severity to look thorough; when uncertain, pick the lower tier with a "verify" note. ${EXCLUDE} Findings only, no padding. If the surface is clean, return an empty findings array.`,
  ].join('\n')
}

function measurementFinderPrompt(measurement) {
  return [
    'Objective: map the production query ranking to the exact Orbit API source locations before the code-wide performance sweep begins.',
    `Measurement: ${performanceMeasurementPrompt(measurement)}.`,
    'Inspect the highest monthly-egress statement first, then continue down the measured rows and cost rankings. Match every measured query shape to its exact LINQ or EF source and return one mappings entry per queryId. Trace callers: executionContext is background only when every path is rooted in Orbit\'s BackgroundService, ScheduledServiceBase, or IScheduledJob infrastructure; it is request when a controller or MCP request path reaches the query, including a query also used by a background service. Never infer the context from whether SQL contains UserId or from call frequency. The top finding must be the highest measured monthly egress, not the statement whose code merely looks most alarming.',
    'Emit findings only for confirmed code shapes. Each finding must include the exact queryId from the measurement, a repo-relative file:line, the code evidence, and the concrete fix. Name the consumer fields for a full-entity projection. The workflow attaches calls, rows per call, bytes per row, calls per month, table fraction, interval, and monthly egress from the trusted measurement by queryId, so do not calculate or invent those values.',
    'Apply the performance checklist thresholds exactly: every request-path list needs Take/pagination even when ownership is scoped indirectly through a foreign key; a background sweep does not need a row limit merely because it walks the whole table; full entity where the consumer reads only a subset; at least 25% of a live table per call; or a confirmed background interval multiplied by payload above 50 MiB per month.',
  ].join('\n')
}

function skepticPrompt(kind, f) {
  const measurement = f.queryId
    ? `Measured queryId=${f.queryId}; calls=${f.calls}; rowsPerCall=${f.rowsPerCall}; bytesPerRow=${f.bytesPerRow}; callsPerMonth=${f.callsPerMonth}; monthlyEgressBytes=${f.monthlyEgressBytes}; tableFraction=${f.tableFraction}; intervalSeconds=${f.intervalSeconds}. These values came from the normalized production measurement and may be refuted only by proving the source mapping is wrong.`
    : ''
  return [
    `Adversarially REFUTE this ${kind} finding. Read the cited location in full context and argue it is a FALSE POSITIVE — the path is unreachable, the query IS userId-scoped, the input is already validated, the index exists (cite the migration), the test WOULD fail on a real break, it is a duplicate, or the severity is inflated.`,
    `Default to refuted=true when uncertain — the burden is on the finding to prove it is real, not on you to prove it isn't.`,
    `Finding: severity=${f.severity} · title=${f.title} · location=${f.location} · evidence=${f.evidence} · rationale=${f.rationale || ''}.`,
    measurement,
    `Return refuted (bool) + note (one line why). If it is real but over-rated, set adjustedSeverity to the correct lower label.`,
  ].join('\n')
}

function criticPrompt(kind, scope, sweptLabels, count) {
  return [
    `Completeness critic for the ${kind} audit of ${scopeLabelFor(scope)}.`,
    `Surfaces swept so far: ${sweptLabels.join(', ')} — producing ${count} findings.`,
    `What did this audit NOT examine — a surface never swept, a file/handler/route skipped, or a claim left unverified (a dead-code grep not run, a userId scope unchecked, an index-in-migration unconfirmed, a critical-path test unmapped)?`,
    `Stay strictly within this audit's calibration: ${KIND[kind].ladder}. Do NOT propose gaps outside the in-scope tiers (for security, enterprise/Tier-3 controls such as GDPR/SOC2, dependency-CVE scanning, SIEM/attack-monitoring are deliberately out of scope; for tests, coverage-percentage). ${GATE_OWNED} Never propose a gap a gate already owns. Propose at most 6 gaps, highest-value first.`,
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
const surfaces = resolveSurfaces(kind, scope)
const isSerious = (f) => rank(f.severity) <= 1
let performanceMeasurement = kind === 'performance'
  ? resolvePerformanceMeasurement(parsedArgs.measurement)
  : null

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

let measuredFindings = []
let measurementFinderFailed = false
if (kind === 'performance' && surfaces.some(isApiSurface)) {
  phase('Measure')
  if (performanceMeasurement.status === 'available') {
    log(`measurement: ${performanceMeasurement.rowsRanking.length} query shapes, ${performanceMeasurement.tableStats.length} tables, stats reset ${performanceMeasurement.statsReset}`)
    const measuredResult = await agent(
      measurementFinderPrompt(performanceMeasurement),
      { label: 'find:measured-hotpaths', phase: 'Measure', model: 'haiku', agentType: 'audit-readonly', schema: MEASURED_FINDINGS_SCHEMA },
    )
    const mappingFailure = measuredHotpathMappingFailure(measuredResult, performanceMeasurement)
    measurementFinderFailed = Boolean(mappingFailure)
    if (mappingFailure) {
      performanceMeasurement = unavailablePerformanceMeasurement(mappingFailure)
      log(`measurement mapping unavailable: CODE_ONLY (${mappingFailure})`)
    } else {
      performanceMeasurement = applyMeasuredQueryContexts(performanceMeasurement, measuredResult.mappings)
      measuredFindings = attachPerformanceMetrics(measuredResult?.findings || [], performanceMeasurement)
    }
  } else {
    log(`measurement unavailable: CODE_ONLY (${performanceMeasurement.reason})`)
  }
}

phase('Find')
log(`audit:${kind} · scope ${scopeLabelFor(scope)} · ${surfaces.length} surfaces`)
const firstPass = (
  await parallel(
    surfaces.map((s) => () =>
      agent(finderPrompt(kind, s, scope, performanceMeasurement), { label: `find:${s.label}`, phase: 'Find', model: 'haiku', agentType: 'audit-readonly', schema: FINDINGS_SCHEMA })
    )
  )
).filter(Boolean)
const sweptLabels = surfaces.map((s) => s.label)
let findings = dedupeFresh([...measuredFindings, ...attachPerformanceMetrics(firstPass.flatMap((r) => r.findings || []), performanceMeasurement)])

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
  const fresh = dedupeFresh(attachPerformanceMetrics(roundRaw, performanceMeasurement))
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

kept.sort((a, b) => {
  const severityDifference = rank(a.severity) - rank(b.severity)
  if (severityDifference !== 0) return severityDifference
  return (b.monthlyEgressBytes ?? -1) - (a.monthlyEgressBytes ?? -1)
})
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
  performanceVerdict: performanceMeasurement?.verdict ?? null,
  performanceMeasurement: performanceMeasurement ? {
    status: performanceMeasurement.status,
    reason: performanceMeasurement.reason,
    statsReset: performanceMeasurement.statsReset,
    windowDays: performanceMeasurement.windowDays,
    rowsRanking: performanceMeasurement.rowsRanking.slice(0, 10),
    egressRanking: performanceMeasurement.egressRanking.slice(0, 10),
    tableStats: performanceMeasurement.tableStats,
    accountSkew: performanceMeasurement.accountSkew,
  } : null,
  measurementFinderFailed,
}
