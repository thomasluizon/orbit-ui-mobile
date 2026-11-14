import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

const { durationMsByFile } = JSON.parse(readFileSync(new URL('./shard-timings.json', import.meta.url), 'utf8'))

function median(values) {
  const sorted = values.toSorted((left, right) => left - right)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
}

const fallbackMsByProject = Object.fromEntries(Object.entries(durationMsByFile)
  .map(([project, files]) => [project, median(Object.values(files))]))

/**
 * Splits files into `count` shards with equal recorded test time: the longest file goes first, each to the
 * lightest shard, and the shard with fewer files wins a tie. A file without a recorded duration counts as its
 * project's median. The result does not depend on the input order, so every shard computes the same split.
 */
export function partitionByDuration(files, count, durationOf, keyOf) {
  const shards = Array.from({ length: count }, () => ({ milliseconds: 0, files: [] }))
  const ordered = files.map((file) => ({ file, key: keyOf(file), milliseconds: durationOf(file) }))
    .sort((left, right) => right.milliseconds - left.milliseconds || left.key.localeCompare(right.key))
  const lighter = (shard, best) => shard.milliseconds < best.milliseconds ||
    (shard.milliseconds === best.milliseconds && shard.files.length < best.files.length)
  for (const entry of ordered) {
    const lightest = shards.reduce((best, shard) => lighter(shard, best) ? shard : best)
    lightest.milliseconds += entry.milliseconds
    lightest.files.push(entry.file)
  }
  return shards
}

/**
 * Vitest `--shard=i/n` by recorded duration instead of by file count; the order inside a shard stays Vitest's own.
 * It loads Vitest's sequencer only at run time, so tooling can import the config through tsx without the runner.
 * Regenerate the durations with `.github/scripts/record-web-shard-timings.mjs`.
 */
export class TimedSequencer {
  constructor(ctx) {
    this.ctx = ctx
  }

  async sort(files) {
    const { BaseSequencer } = await import('vitest/node')
    return new BaseSequencer(this.ctx).sort(files)
  }

  async shard(files) {
    const { root, shard: { index, count } } = this.ctx.config
    const pathOf = (file) => relative(root, file.moduleId).split('\\').join('/')
    const durationOf = (file) => durationMsByFile[file.project.name]?.[pathOf(file)] ?? fallbackMsByProject[file.project.name] ?? 0
    return partitionByDuration(files, count, durationOf, (file) => `${file.project.name}:${pathOf(file)}`)[index - 1].files
  }
}
