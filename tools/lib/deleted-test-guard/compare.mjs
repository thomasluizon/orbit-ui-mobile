/** Compares the mutants of the base run and the head run. */

const KILLED = new Set(["Killed", "Timeout"])

/** The identity of a mutant across two runs: its place in the file, its mutator and its replacement. */
export const mutantKey = (mutant, line = mutant.location.start.line) =>
  `${line}:${mutant.location.start.column}-${mutant.location.end.line - mutant.location.start.line}:${mutant.location.end.column}|${mutant.mutatorName}|${mutant.replacement}`

/** The flat mutants of a Stryker report: `{ file, id, key fields, status, killedBy }`. */
export const readMutants = (report) =>
  Object.entries(report.files ?? {}).flatMap(([file, entry]) => (entry.mutants ?? []).map((mutant) => ({ ...mutant, file })))

/** The test files that hold the given test ids, from the `testFiles` of a Stryker report. */
export const testFilesOf = (report, ids) => {
  const owner = new Map()
  for (const [file, entry] of Object.entries(report.testFiles ?? {})) for (const test of entry.tests ?? []) owner.set(test.id, file)
  return [...new Set((ids ?? []).map((id) => owner.get(id)).filter((file) => file !== undefined))]
}

/**
 * Judges each base mutant that a test killed.
 * - `scope(mutant)` returns the head place of a base mutant: `{ file, startLine, endLine }`, or `{ skipped: reason }` for a
 *   source file that the pull request deletes, or `{ changed: true }` when the pull request changed a line of the mutant.
 * - `headByKey` is a Map from `${file}|${mutantKey}` to the head mutant.
 * Returns `{ failed, passed, review }`. A failure is a base kill that survives on head. A mutant that times out on both runs
 * passes. A base kill that times out on head goes to `retry` for one more run. The rest goes to `review` with a reason.
 */
export const judgeMutants = ({ baseMutants, scope, headByKey }) => {
  const result = { failed: [], passed: [], review: [], retry: [] }
  for (const base of baseMutants) {
    if (!KILLED.has(base.status)) continue
    const place = scope(base)
    if (place.skipped !== undefined) continue
    if (place.changed) {
      result.review.push({ mutant: base, reason: "changed-line" })
      continue
    }
    const head = headByKey.get(`${place.file}|${mutantKey(base, place.startLine)}`)
    if (head === undefined) result.review.push({ mutant: base, reason: "no-head-mutant", place })
    else if (head.status === "Killed") result.passed.push({ mutant: base, head, place })
    else if (head.status === "Timeout") (base.status === "Timeout" ? result.passed : result.retry).push({ mutant: base, head, place })
    else if (head.status === "Survived" || head.status === "NoCoverage") result.failed.push({ mutant: base, head, place })
    else result.review.push({ mutant: base, head, place, reason: `head-${head.status}` })
  }
  return result
}
