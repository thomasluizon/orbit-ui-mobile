/** Reads the `lcov.info` text of a V8 coverage run. */

import { isAbsolute, resolve } from "node:path"

/**
 * `Map<absolute file, Map<line, hits>>`. A relative `SF:` path is relative to `root`. The line of a function that ran counts as a
 * covered line: V8 reports the body lines only, and a mutant can replace the body from the line of the signature.
 */
export const parseLcov = (text, root) => {
  const files = new Map()
  let lines = null
  let functionLines = null
  for (const row of text.split("\n")) {
    if (row.startsWith("SF:")) {
      const path = row.slice(3).trim()
      lines = new Map()
      functionLines = new Map()
      files.set(isAbsolute(path) ? path : resolve(root, path), lines)
    } else if (row.startsWith("DA:") && lines !== null) {
      const [line, hits] = row.slice(3).split(",").map(Number)
      lines.set(line, Math.max(lines.get(line) ?? 0, hits))
    } else if (row.startsWith("FN:") && functionLines !== null) {
      const comma = row.indexOf(",")
      functionLines.set(row.slice(comma + 1), Number(row.slice(3, comma)))
    } else if (row.startsWith("FNDA:") && lines !== null) {
      const comma = row.indexOf(",")
      const line = functionLines.get(row.slice(comma + 1))
      if (line !== undefined) lines.set(line, Math.max(lines.get(line) ?? 0, Number(row.slice(5, comma))))
    } else if (row === "end_of_record") lines = null
  }
  return files
}

/** The lines of one file with at least one hit. */
export const coveredLines = (lines) => [...lines].filter(([, hits]) => hits > 0).map(([line]) => line)

/**
 * The covered lines of a file plus the lines after them that hold no code (a closing bracket, a blank line, a comment), up to the
 * next line that holds code. A mutant can span a whole block, so the range for Stryker must reach its closing line.
 */
export const mutationScope = (lines, lineCount) => {
  const scope = new Set(coveredLines(lines))
  for (const line of coveredLines(lines)) {
    for (let next = line + 1; next <= lineCount && !lines.has(next); next++) scope.add(next)
  }
  return [...scope].sort((first, second) => first - second)
}
