import { AUTO_COMPACT_TOKENS } from "./session-context.mjs"

/**
 * The relay cost model. Every field name was read from a real transcript record: `type: "assistant"`,
 * `isSidechain`, `timestamp`, `message.id`, `message.usage.{input_tokens, cache_creation_input_tokens,
 * cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}, cache_read_input_tokens, output_tokens}` and `message.content[].{type: "tool_use", name, input}`.
 * The session ledger supplies `triggeredAt` and the cumulative `shipped` list.
 */

/**
 * Cost of one token class as a multiple of the base input price. Source: the Claude Opus 5.5 row of
 * the model price table (input 4 USD, output 20 USD, cache read 0.20 USD per million tokens) and the
 * published cache write multiples: 1.25 for the 5-minute TTL and 2 for the 1-hour TTL.
 */
export const PRICE_WEIGHTS = { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.05, output: 5 }

/** The first tool call that does real queue work. Every call before it is the successor's entry. */
const USEFUL_ACTION = /launch-worker\.mjs|wait-ci\.mjs|wait-release\.mjs|gh (?:pr|issue) (?:create|merge|review|comment|edit|close)|create-ticket\.mjs|git worktree add|record-readiness\.mjs|verify-delivery\.mjs|complete-ticket\.mjs/

const median = (values) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const percentile = (values, fraction) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]
}

const mean = (values) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * Splits the created tokens by cache TTL. A record whose `cache_creation` split is absent, or does not
 * add up to `cache_creation_input_tokens`, prices every created token as a 5-minute write.
 */
const cacheWritesByTtl = (usage) => {
  const total = usage.cache_creation_input_tokens
  const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens
  const fiveMinute = usage.cache_creation?.ephemeral_5m_input_tokens
  const split = Number.isInteger(oneHour) && Number.isInteger(fiveMinute) && oneHour >= 0 && fiveMinute >= 0 && oneHour + fiveMinute === total
  return { cacheWrite1h: split ? oneHour : 0, cacheWrite5m: split ? fiveMinute : total }
}

/** Top-level assistant calls in order. A streamed call writes several records; the last usage wins. */
export const parseCalls = (transcriptText) => {
  const calls = new Map()
  for (const line of transcriptText.split("\n")) {
    if (!line) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record?.type !== "assistant" || record.isSidechain === true) continue
    const usage = record.message?.usage
    const id = record.message?.id
    if (typeof id !== "string" || !usage) continue
    const fields = [usage.input_tokens, usage.cache_creation_input_tokens, usage.cache_read_input_tokens, usage.output_tokens]
    if (!fields.every((value) => Number.isInteger(value) && value >= 0)) continue
    const call = calls.get(id) ?? { actions: [], timestamp: record.timestamp }
    call.input = usage.input_tokens
    Object.assign(call, cacheWritesByTtl(usage))
    call.cacheRead = usage.cache_read_input_tokens
    call.output = usage.output_tokens
    call.contextTokens = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens
    for (const block of record.message.content ?? []) {
      if (block?.type === "tool_use") call.actions.push(`${block.name} ${JSON.stringify(block.input ?? {})}`)
    }
    calls.set(id, call)
  }
  return [...calls.values()]
}

export const callCost = (call, weights = PRICE_WEIGHTS) =>
  call.input * weights.input + call.cacheWrite5m * weights.cacheWrite5m + call.cacheWrite1h * weights.cacheWrite1h + call.cacheRead * weights.cacheRead + call.output * weights.output

const sumCost = (calls, weights) => calls.reduce((sum, call) => sum + callCost(call, weights), 0)

/** Least squares slope of context size over call index. */
export const growthSlope = (calls) => {
  if (calls.length < 2) return 0
  const meanIndex = (calls.length - 1) / 2
  const meanContext = mean(calls.map((call) => call.contextTokens))
  let numerator = 0
  let denominator = 0
  calls.forEach((call, index) => {
    numerator += (index - meanIndex) * (call.contextTokens - meanContext)
    denominator += (index - meanIndex) ** 2
  })
  return numerator / denominator
}

/**
 * Splits one session into the entry (before the first useful action), the work, and the wind-down
 * (from the relay trigger on: drain plus handoff). A session with no trigger has no wind-down.
 */
export const splitSession = (calls, triggeredAt, weights = PRICE_WEIGHTS) => {
  const trigger = triggeredAt ? Date.parse(triggeredAt) : Number.NaN
  const windDownStart = Number.isFinite(trigger) ? calls.findIndex((call) => Date.parse(call.timestamp) >= trigger) : -1
  const end = windDownStart === -1 ? calls.length : windDownStart
  const firstUseful = calls.slice(0, end).findIndex((call) => call.actions.some((action) => USEFUL_ACTION.test(action)))
  const entryEnd = firstUseful === -1 ? end : firstUseful
  const entry = calls.slice(0, entryEnd)
  const work = calls.slice(entryEnd, end)
  const windDown = calls.slice(end)
  return {
    entry, work, windDown,
    entryCost: sumCost(entry, weights),
    workCost: sumCost(work, weights),
    windDownCost: sumCost(windDown, weights),
    startContext: calls[0]?.contextTokens ?? 0,
    entryEndContext: work[0]?.contextTokens ?? entry.at(-1)?.contextTokens ?? 0,
    triggerContext: calls[end - 1]?.contextTokens ?? 0,
    peakContext: Math.max(0, ...calls.map((call) => call.contextTokens)),
    growthPerWorkCall: growthSlope(work),
  }
}

/** Distinct shipped pull requests that a session added to the cumulative ledger list. */
export const mergedDelta = (shipped = [], previousShipped = []) => {
  const key = (row) => `${row.repository}#${row.pullRequest}`
  const known = new Set(previousShipped.map(key))
  return new Set(shipped.map(key).filter((value) => !known.has(value))).size
}

/**
 * How the soft and hard policy behaved. A chain entry records `forced` (the hard ceiling began the relay),
 * `armedAt` (the soft threshold armed it) and `triggeredAt` (the relay began). An entry with no
 * `triggeredAt` never relayed. An entry with no `armedAt` began at its first quiet point without arming.
 */
export const relayPolicyStats = (entries) => {
  const relays = entries.filter((entry) => Number.isFinite(Date.parse(entry.triggeredAt)) && typeof entry.forced === "boolean")
  const delays = relays
    .filter((entry) => Number.isFinite(Date.parse(entry.armedAt)))
    .map((entry) => Math.max(0, (Date.parse(entry.triggeredAt) - Date.parse(entry.armedAt)) / 60_000))
  const forced = relays.filter((entry) => entry.forced).length
  return {
    relays: relays.length,
    forced,
    forcedShare: relays.length === 0 ? null : forced / relays.length,
    armed: delays.length,
    armToRelayMinutesMedian: delays.length === 0 ? null : median(delays),
    armToRelayMinutesP90: delays.length === 0 ? null : percentile(delays, 0.9),
  }
}

/** The part of one call's cost that grows with the context: the cache read. */
export const contextCost = (context, weights = PRICE_WEIGHTS) => context * weights.cacheRead

/**
 * Weighted cost per work call when the relay arms at `threshold` tokens. A session makes
 * n = (threshold - entryEndContext) / growth work calls with a context that rises linearly. It also
 * pays the fixed entry and a wind-down of `windDownCalls` calls at the threshold plus the overshoot.
 */
export const costPerWorkCall = (threshold, model, weights = PRICE_WEIGHTS) => {
  const calls = (threshold - model.entryEndContext) / model.growthPerWorkCall
  if (!(calls > 0)) return Number.POSITIVE_INFINITY
  const averageContext = (model.entryEndContext + threshold) / 2
  const work = calls * (contextCost(averageContext, weights) + model.nonReadCostPerCall)
  const windDown = model.windDownCalls * (contextCost(threshold + model.overshootTokens, weights) + model.nonReadCostPerCall)
  return (model.entryCost + work + windDown) / calls
}

/** Scans thresholds and reports the cheapest, plus the band that stays within `tolerance` of it. */
export const optimalThreshold = (model, { low = 100_000, high = AUTO_COMPACT_TOKENS, step = 1000, tolerance = 0.02, weights = PRICE_WEIGHTS } = {}) => {
  const curve = []
  for (let threshold = low; threshold <= high; threshold += step) curve.push({ threshold, cost: costPerWorkCall(threshold, model, weights) })
  const best = curve.reduce((winner, point) => point.cost < winner.cost ? point : winner)
  const band = curve.filter((point) => point.cost <= best.cost * (1 + tolerance))
  return { threshold: best.threshold, costPerWorkCall: best.cost, bandLow: band[0].threshold, bandHigh: band.at(-1).threshold, curve }
}

/** Aggregates per-session splits into the model parameters. Medians resist the long outlier sessions. */
export const buildModel = (splits, weights = PRICE_WEIGHTS) => {
  const usable = splits.filter((split) => split.entry.length > 0 && split.work.length >= 10 && split.growthPerWorkCall > 0)
  const wound = usable.filter((split) => split.windDown.length > 0)
  const overshoots = wound.map((split) => split.peakContext - split.triggerContext)
  const nonRead = (call) => callCost(call, weights) - call.cacheRead * weights.cacheRead
  return {
    sessions: usable.length,
    entryCalls: median(usable.map((split) => split.entry.length)),
    entryCost: median(usable.map((split) => split.entryCost)),
    startContext: median(usable.map((split) => split.startContext)),
    entryEndContext: median(usable.map((split) => split.entryEndContext)),
    growthPerWorkCall: median(usable.map((split) => split.growthPerWorkCall)),
    nonReadCostPerCall: mean(usable.flatMap((split) => split.work).map(nonRead)),
    windDownCalls: median(wound.map((split) => split.windDown.length)),
    overshootTokens: median(overshoots),
    overshootP90Tokens: percentile(overshoots, 0.9),
  }
}

const roundTo = (value, unit, direction) => Math[direction](value / unit) * unit

/**
 * The soft threshold is the cheapest point on the cost curve. The hard ceiling is the top of the band
 * that stays within the tolerance of that minimum, so waiting for a quiet point never costs more.
 */
export const recommendThresholds = (model, options = {}) => {
  const optimum = optimalThreshold(model, options)
  return { soft: roundTo(optimum.threshold, 10_000, "round"), hard: roundTo(optimum.bandHigh, 10_000, "floor"), optimum }
}
