/**
 * One duration for each key of several runs: the median of the runs that hold the key, rounded, in key order. A hosted
 * runner can be much slower than the next one, so the durations of one run move together with its runner.
 */
export function medianDurations(runs) {
  const keys = [...new Set(runs.flatMap((run) => Object.keys(run)))].sort((left, right) => left.localeCompare(right))
  return Object.fromEntries(keys.map((key) => {
    const values = runs.filter((run) => Object.hasOwn(run, key)).map((run) => run[key]).sort((left, right) => left - right)
    const middle = Math.floor(values.length / 2)
    return [key, Math.round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2)]
  }))
}
