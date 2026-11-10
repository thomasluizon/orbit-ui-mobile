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
