/** Finds the test files that lose lines in a diff. */

import { parseDiff } from "./diff.mjs"

const WORKSPACES = ["apps/web", "apps/mobile"]
const TEST_FILE = /(?:^|\/)__tests__\/.+\.test\.[cm]?[jt]sx?$|\.test\.[cm]?[jt]sx?$/
/** A line that holds no behaviour: a blank line, a bracket or a comment, an import. A lost line of this kind loses no test. */
const NO_BEHAVIOUR = /^(?:[\s)\]}[({,;]*|\/\/.*|\/\*.*|\*.*|import\b.*|export \{.*|\} from .*)$/

export const isTestFile = (path) => TEST_FILE.test(path)

/** The workspace folder of a test file when the guard runs its tests (`apps/web` or `apps/mobile`), else null. */
export const workspaceOf = (path) => WORKSPACES.find((workspace) => path.startsWith(`${workspace}/`)) ?? null

/** The removed lines of a changed file that no added line of the same file puts back, with their base line numbers. */
const lostLinesOf = (file) => {
  const restored = new Map()
  for (const { text } of file.added) restored.set(text.trim(), (restored.get(text.trim()) ?? 0) + 1)
  return file.removed.filter(({ text }) => {
    const trimmed = text.trim()
    if (NO_BEHAVIOUR.test(trimmed)) return false
    const count = restored.get(trimmed) ?? 0
    if (count === 0) return true
    restored.set(trimmed, count - 1)
    return false
  })
}

/**
 * The test files that lose lines: `{ file, headFile, deleted, workspace, lostLines }`. `file` is the base path and `headFile`
 * the head path (null for a deleted file). A file that only gains lines, or that loses only blank lines, comments and
 * imports, is not listed. A test file outside `apps/web` and `apps/mobile` has a null workspace: the guard cannot run it.
 */
export const findLostTests = (diffText) => parseDiff(diffText)
  .filter((file) => file.oldPath !== null && isTestFile(file.oldPath) && !file.binary)
  .map((file) => ({
    file: file.oldPath,
    headFile: file.newPath,
    deleted: file.newPath === null,
    workspace: workspaceOf(file.oldPath),
    lostLines: lostLinesOf(file),
  }))
  .filter((test) => test.lostLines.length > 0)
