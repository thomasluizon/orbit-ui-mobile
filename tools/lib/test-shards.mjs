/**
 * Deterministic partition of the tools harness case modules into CI shards.
 * The harness runs one shard per CI job, so every module must land in exactly one shard.
 */

import { spawn } from "node:child_process"

/** Parse `i/n` into a 1-based shard index and the shard count, or null when the text is not a valid shard. */
export const parseShard = (text) => {
  const match = /^(\d+)\/(\d+)$/.exec(text ?? "")
  if (!match) return null
  const index = Number(match[1])
  const count = Number(match[2])
  return index >= 1 && index <= count ? { index, count } : null
}

/** The most shards a local run starts at one time. CI runs its own count (the tool-tests matrix in test.yml), so a local run above that count splits the modules more finely than CI. */
export const MAX_LOCAL_SHARDS = 8

/**
 * The shard count of a full local run: one shard for each core, at most MAX_LOCAL_SHARDS.
 * A shard that shares a core with another shard runs its timed cases late and fails them, so a
 * machine with fewer cores than shards gets fewer shards, never a red run from CPU starvation.
 */
export const localShardCount = (cores) => Math.min(MAX_LOCAL_SHARDS, Math.max(1, Math.floor(cores)))

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
  "Per-shard # tool-timings lines from every Tool tests (i/n) job of each sourceRuns PR Tests run, merged by tools/record-tool-timings.mjs. Each module owns the median over those runs of the wall seconds of its contract checks and cases, so one slow runner does not move the split. fixedSeconds is the largest per-shard harness overhead outside the modules. Only modules that test-tools.mjs registers are kept."

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

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Math.round(value * 10) / 10
}

/**
 * Combine the merged tables of several runs: each module of `modules` gets the median of the seconds that the runs
 * measured for it, and fixedSeconds is the largest overhead. A module that no run measured is left out, so the
 * partition gives it the mean weight. Returns the names that the runs measured but `modules` does not register.
 */
export const medianTimings = (tables, modules) => {
  const registered = new Set(modules)
  const measured = new Map()
  for (const table of tables) {
    for (const [module, seconds] of Object.entries(table.seconds)) measured.set(module, [...(measured.get(module) ?? []), seconds])
  }
  const names = [...measured.keys()].sort((left, right) => left.localeCompare(right))
  return {
    fixedSeconds: Math.max(...tables.map((table) => table.fixedSeconds)),
    seconds: Object.fromEntries(names.filter((module) => registered.has(module)).map((module) => [module, median(measured.get(module))])),
    unregistered: names.filter((module) => !registered.has(module)),
  }
}

/**
 * The projected CI seconds of the slowest shard: its measured module seconds plus the fixed per-shard overhead.
 * Seconds are absolute, so a slower harness raises the projection.
 */
export const slowestShardSeconds = ({ modules, seconds, fixedSeconds, shards }) =>
  Math.max(...shards.map((shard) => fixedSeconds + shardSeconds({ modules, seconds, shard })))

const ASSERTIONS_LINE = /^Assertions: (\d+) \|/m

/**
 * Runs shards 1/n to n/n as n Node processes at one time. `argsOf(shardName)` gives the Node
 * arguments of one shard. `onShardEnd(shardName, status, output)` receives the whole output of a
 * shard when it ends, so the lines of two shards never interleave. Resolves the failed shard names
 * and the sum of the "Assertions: N" lines.
 */
export const runShardsInParallel = async (count, argsOf, onShardEnd) => {
  const outcomes = await Promise.all(Array.from({ length: count }, (_, offset) => new Promise((resolve) => {
    const shardName = `${offset + 1}/${count}`
    const child = spawn(process.execPath, argsOf(shardName), { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
    let output = ""
    child.stdout.on("data", (chunk) => { output += chunk })
    child.stderr.on("data", (chunk) => { output += chunk })
    let settled = false
    const finish = (status, extra = "") => {
      if (settled) return
      settled = true
      output += extra
      onShardEnd(shardName, status, output)
      resolve({ shardName, status, assertions: Number(ASSERTIONS_LINE.exec(output)?.[1] ?? 0) })
    }
    child.once("error", (error) => finish(1, `${error.message}\n`))
    child.once("close", (status, signal) => finish(status ?? signal))
  })))
  return {
    failed: outcomes.filter((outcome) => outcome.status !== 0).map((outcome) => outcome.shardName),
    assertions: outcomes.reduce((total, outcome) => total + outcome.assertions, 0),
  }
}
