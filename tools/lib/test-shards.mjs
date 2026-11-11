/**
 * Deterministic partition of the tools harness case modules into CI shards.
 * The harness runs one shard per CI job, so every module must land in exactly one shard.
 */

/** Parse `i/n` into a 1-based shard index and the shard count, or null when the text is not a valid shard. */
export const parseShard = (text) => {
  const match = /^(\d+)\/(\d+)$/.exec(text ?? "")
  if (!match) return null
  const index = Number(match[1])
  const count = Number(match[2])
  return index >= 1 && index <= count ? { index, count } : null
}

/** A module with no measured weight costs the mean of the measured weights, so a new module still lands in a shard. */
const meanSeconds = (modules, seconds) => {
  const measured = modules.filter((module) => seconds[module] !== undefined)
  return measured.length === 0 ? 1 : measured.reduce((total, module) => total + seconds[module], 0) / measured.length
}
const weightOf = (module, seconds, fallback) => seconds[module] ?? fallback

/**
 * Longest-processing-time-first partition: heaviest module first, onto the lightest shard.
 * Ties break on module name and shard index, so the same inputs always give the same shards.
 * Returns `shardCount` arrays of module names, each sorted by name.
 */
export const partitionModules = ({ modules, seconds, shardCount }) => {
  const fallback = meanSeconds(modules, seconds)
  const ordered = [...modules].sort(
    (left, right) => weightOf(right, seconds, fallback) - weightOf(left, seconds, fallback) || left.localeCompare(right),
  )
  const shards = Array.from({ length: shardCount }, () => ({ modules: [], load: 0 }))
  for (const module of ordered) {
    const lightest = shards.reduce((best, shard) => (shard.load < best.load ? shard : best))
    lightest.modules.push(module)
    lightest.load += weightOf(module, seconds, fallback)
  }
  return shards.map((shard) => shard.modules.sort((left, right) => left.localeCompare(right)))
}

/** The estimated seconds of a shard, using the same fallback weight the partition used. */
export const shardSeconds = ({ modules, seconds, shard }) => {
  const fallback = meanSeconds(modules, seconds)
  return shard.reduce((total, module) => total + weightOf(module, seconds, fallback), 0)
}

/** Modules that no shard runs, and modules that more than one shard runs, plus names a shard invents. */
export const partitionDefects = ({ modules, shards }) => {
  const counts = new Map()
  for (const module of shards.flat()) counts.set(module, (counts.get(module) ?? 0) + 1)
  const known = new Set(modules)
  return {
    missing: modules.filter((module) => !counts.has(module)),
    duplicated: [...counts].filter(([, count]) => count > 1).map(([module]) => module),
    unknown: [...counts.keys()].filter((module) => !known.has(module)),
  }
}

/** Every shard prints one line that starts with this marker, then a JSON object, at the end of its run. */
export const TIMINGS_MARKER = "# tool-timings "

/**
 * The only description tools/test-tools-timings.json carries. It names no run, so a regeneration cannot
 * carry a stale description forward: `sourceRun` is the only provenance field.
 */
export const TIMINGS_METHOD =
  "Per-shard # tool-timings lines from every Tool tests (i/n) job of the sourceRun PR Tests run, merged by tools/record-tool-timings.mjs. Each module owns the wall seconds of its contract checks and cases. fixedSeconds is the largest per-shard harness overhead outside the modules."

/**
 * Merge the timing lines of every shard of one run into one table.
 * A module runs in one shard, so its seconds come from one line. `fixedSeconds` is the largest per-shard overhead.
 * Throws when the lines do not hold exactly one line for each shard 1..n of a single n: a shard with no line
 * would silently drop its modules from the table.
 */
export const mergeTimingLines = (text) => {
  const timings = text.split("\n").filter((line) => line.includes(TIMINGS_MARKER))
    .map((line) => JSON.parse(line.slice(line.indexOf(TIMINGS_MARKER) + TIMINGS_MARKER.length)))
  if (timings.length === 0) throw new Error(`the log holds no "${TIMINGS_MARKER.trim()}" line`)
  const shards = timings.map((timing) => ({ timing, shard: parseShard(timing.shard) }))
  const unsharded = shards.find(({ shard }) => !shard)
  if (unsharded) throw new Error(`a timing line names shard ${JSON.stringify(unsharded.timing.shard)}, not i/n`)
  const counts = [...new Set(shards.map(({ shard }) => shard.count))].sort((left, right) => left - right)
  if (counts.length > 1) throw new Error(`the timing lines mix shard counts ${counts.join(", ")}`)
  const [count] = counts
  const lines = Array.from({ length: count }, (_, position) => shards.filter(({ shard }) => shard.index === position + 1).length)
  const duplicated = lines.flatMap((total, position) => (total > 1 ? [`${position + 1}/${count}`] : []))
  if (duplicated.length > 0) throw new Error(`more than one timing line for shard ${duplicated.join(", ")}`)
  const missing = lines.flatMap((total, position) => (total === 0 ? [`${position + 1}/${count}`] : []))
  if (missing.length > 0) throw new Error(`no timing line for shard ${missing.join(", ")}`)
  const seconds = Object.assign({}, ...timings.map((timing) => timing.seconds))
  return {
    fixedSeconds: Math.max(...timings.map((timing) => timing.fixedSeconds)),
    seconds: Object.fromEntries(Object.entries(seconds).sort(([left], [right]) => left.localeCompare(right))),
  }
}

/**
 * The projected CI seconds of the slowest shard: its measured module seconds plus the fixed per-shard overhead.
 * Seconds are absolute, so a slower harness raises the projection.
 */
export const slowestShardSeconds = ({ modules, seconds, fixedSeconds, shards }) =>
  Math.max(...shards.map((shard) => fixedSeconds + shardSeconds({ modules, seconds, shard })))
