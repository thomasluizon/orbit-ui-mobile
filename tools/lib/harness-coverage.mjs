/**
 * The harness coverage ratchet: per-tool assertion counts may grow freely and may never drop.
 *
 * Silent coverage loss is the root defect ORB-163 exists to remove, measured twice on its own
 * PR1. A bare `return` in the middle of a case function disabled about 60 assertions and the
 * harness still printed PASS lines and exited 0. A later head replaced a 10-assertion case body
 * with a single `--help` grep and a 9-assertion one with two, and nothing failed. Both were
 * caught by a human reading a diff, which is exactly the control this ticket replaces.
 *
 * The count must come from EXECUTING the suite and tallying reported assertion names, never
 * from a regex over the source: a static count cannot see an unreachable `return`.
 *
 * Shrink-only in the opposite direction from the context budget. Growth is free; shrinkage
 * needs the `coverage:reseed` label, which the CI job turns into the reseed environment flag.
 */

export const BASELINE_VERSION = 1

/** A baseline is `{ version, total, tools }` with integer counts and a total that agrees. */
export function readBaselineShape(baseline) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) return "the baseline is not an object"
  if (baseline.version !== BASELINE_VERSION) return `the baseline version is ${baseline.version}, expected ${BASELINE_VERSION}`
  const tools = baseline.tools
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) return "the baseline has no tools object"
  const entries = Object.entries(tools)
  if (entries.length === 0) return "the baseline names no tools, so it would ratchet nothing"
  const malformed = entries.filter(([, count]) => !Number.isInteger(count) || count < 0)
  if (malformed.length > 0) return `the baseline counts are not non-negative integers: ${malformed.map(([tool]) => tool).join(", ")}`
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  if (baseline.total !== total) return `the baseline total is ${baseline.total} but its per-tool counts sum to ${total}`
  return null
}

export function buildBaseline(tally) {
  const tools = Object.fromEntries(Object.entries(tally).sort(([left], [right]) => left.localeCompare(right)))
  return { version: BASELINE_VERSION, total: Object.values(tools).reduce((sum, count) => sum + count, 0), tools }
}

/**
 * A drop is a tool whose observed count is below its baseline, INCLUDING a tool that vanished
 * from the tally entirely; that is the shape a deleted case module takes.
 */
export function compareCoverage(baseline, tally) {
  const baselineTools = baseline?.tools ?? {}
  const drops = Object.entries(baselineTools)
    .map(([tool, count]) => ({ tool, baseline: count, observed: tally[tool] ?? 0 }))
    .filter(({ baseline: expected, observed }) => observed < expected)
    .sort((left, right) => left.tool.localeCompare(right.tool))
  const growth = Object.entries(tally)
    .map(([tool, count]) => ({ tool, baseline: baselineTools[tool] ?? 0, observed: count }))
    .filter(({ baseline: expected, observed }) => observed > expected)
    .sort((left, right) => left.tool.localeCompare(right.tool))
  const baselineTotal = Object.values(baselineTools).reduce((sum, count) => sum + count, 0)
  const observedTotal = Object.values(tally).reduce((sum, count) => sum + count, 0)
  return { drops, growth, baselineTotal, observedTotal }
}

/** One line per tool, plus the totals. Printed every run so a drop is visible even when allowed. */
export function formatCoverage(tally, comparison) {
  const rows = Object.entries(tally)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tool, count]) => `  ${tool.padEnd(34)}${String(count).padStart(5)}`)
  const totals = [`  ${"TOTAL".padEnd(34)}${String(comparison.observedTotal).padStart(5)}  (baseline ${comparison.baselineTotal})`]
  return [...rows, ...totals].join("\n")
}

export function formatDrops(drops) {
  return drops
    .map(({ tool, baseline, observed }) => `  ${tool}: ${baseline} assertions in the baseline, ${observed} now (${observed - baseline})`)
    .join("\n")
}
