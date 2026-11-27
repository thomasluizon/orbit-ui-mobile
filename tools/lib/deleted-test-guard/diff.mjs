/** Reads `git diff -U0` text: the changed lines of each file and the map from a base line number to a head line number. */

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * One entry for each changed file: `{ oldPath, newPath, status, hunks, added, removed }`. `oldPath` is null for an added file
 * and `newPath` is null for a deleted file. `hunks` hold `{ oldStart, oldCount, newStart, newCount }`. `added` and `removed`
 * hold `{ line, text }` with the line number in the head and in the base.
 */
export const parseDiff = (text) => {
  const files = []
  let file = null
  let oldLine = 0
  let newLine = 0
  const finish = () => {
    if (file === null) return
    file.status = file.oldPath === null ? "added" : file.newPath === null ? "deleted" : file.oldPath === file.newPath ? "modified" : "renamed"
    files.push(file)
  }
  for (const row of text.split("\n")) {
    if (row.startsWith("diff --git ")) {
      finish()
      file = { oldPath: "", newPath: "", status: "modified", hunks: [], added: [], removed: [], binary: false }
      continue
    }
    if (file === null) continue
    const hunk = HUNK.exec(row)
    if (hunk !== null) {
      const [oldStart, oldCount, newStart, newCount] = [Number(hunk[1]), Number(hunk[2] ?? 1), Number(hunk[3]), Number(hunk[4] ?? 1)]
      file.hunks.push({ oldStart, oldCount, newStart, newCount })
      oldLine = oldStart
      newLine = newStart
      continue
    }
    if (row.startsWith("--- ")) file.oldPath = row.slice(4) === "/dev/null" ? null : row.slice(6)
    else if (row.startsWith("+++ ")) file.newPath = row.slice(4) === "/dev/null" ? null : row.slice(6)
    else if (row.startsWith("rename from ")) file.oldPath = row.slice("rename from ".length)
    else if (row.startsWith("rename to ")) file.newPath = row.slice("rename to ".length)
    else if (row.startsWith("Binary files ")) file.binary = true
    else if (file.hunks.length > 0 && row.startsWith("-")) file.removed.push({ line: oldLine++, text: row.slice(1) })
    else if (file.hunks.length > 0 && row.startsWith("+")) file.added.push({ line: newLine++, text: row.slice(1) })
  }
  finish()
  return files
}

/** The head line of a base line, or null when a hunk changed the line. */
export const mapLine = (hunks, line) => {
  let offset = 0
  for (const { oldStart, oldCount, newCount } of hunks) {
    if (oldCount === 0) {
      if (oldStart < line) offset += newCount
    } else if (oldStart + oldCount - 1 < line) offset += newCount - oldCount
    else if (oldStart <= line) return null
  }
  return line + offset
}

/**
 * Maps a set of base lines to head ranges. `ranges` are runs of consecutive head lines; `changed` lists the base lines
 * that a hunk changed. A run ends where a changed line or an inserted line splits it.
 */
export const mapLines = (hunks, lines) => {
  const ranges = []
  const changed = []
  for (const line of [...lines].sort((first, second) => first - second)) {
    const mapped = mapLine(hunks, line)
    if (mapped === null) {
      changed.push(line)
      continue
    }
    const last = ranges.at(-1)
    if (last !== undefined && last.end + 1 === mapped) last.end = mapped
    else ranges.push({ start: mapped, end: mapped })
  }
  return { ranges, changed }
}

/** Runs of consecutive numbers in a list of lines, as `{ start, end }`. */
export const toRanges = (lines) => {
  const ranges = []
  for (const line of [...new Set(lines)].sort((first, second) => first - second)) {
    const last = ranges.at(-1)
    if (last !== undefined && last.end + 1 === line) last.end = line
    else ranges.push({ start: line, end: line })
  }
  return ranges
}
