/**
 * The one count of the size of a change, and the one cap. A worker push, a pull request and the merge bar all read it.
 * The count is additions plus deletions. A file that adds no review work counts 0: a file deleted whole, a rename with no
 * content change, a binary file and a generated file.
 */

import { spawnSync } from "node:child_process"

export const MAX_CHANGED_LINES = 400
export const TARGET_CHANGED_LINES = 200

/** The files that a tool writes, so no reviewer reads them. Each entry matches a whole path. */
export const GENERATED = Object.freeze([
  /^apps\/web\/vitest\/shard-timings\.json$/,
  /^\.github\/layout-shard-timings\.json$/,
  /(?:^|\/)package-lock\.json$/,
  /(?:^|\/)__snapshots__\/[^/]*\.snap$/,
])

/** The statuses of a deleted file: the GitHub word and the git letter. */
const DELETED = new Set(["removed", "D"])

/** A count that git cannot give for a binary file is `null`, and a missing count is 0 lines of text. */
const lines = (count) => (Number.isInteger(count) && count > 0 ? count : 0)

/** How many lines of one `{ path, status, additions, deletions }` file count. */
export const fileLines = ({ path, status, additions, deletions }) => {
  if (DELETED.has(status) || GENERATED.some((pattern) => pattern.test(path))) return 0
  return lines(additions) + lines(deletions)
}

/** The changed lines of a list of `{ path, status, additions, deletions }` files. A pure rename has 0 and 0, so it counts 0. */
export const changedLines = (files) => files.reduce((sum, file) => sum + fileLines(file), 0)

const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr ?? result.error?.message ?? "").trim()}`)
  return result.stdout
}

/** The paths of `git diff -M --name-status -z`: `<status> NUL <path> NUL`, and `R<score> NUL <old> NUL <new> NUL` for a rename or a copy. */
const statusOf = (output) => {
  const fields = output.split("\0")
  const statuses = new Map()
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index++]
    const moved = status.startsWith("R") || status.startsWith("C")
    if (moved) index++
    statuses.set(fields[index++], status)
  }
  return statuses
}

/** The records of `git diff -M --numstat -z`: `<add> TAB <del> TAB <path> NUL`, and `<add> TAB <del> TAB NUL <old> NUL <new> NUL` for a rename or a copy. A binary file has `-` for both counts. */
const countsOf = (output) => {
  const fields = output.split("\0")
  const counts = new Map()
  for (let index = 0; index < fields.length - 1;) {
    const [additions, deletions, path] = fields[index++].split("\t")
    const moved = path === ""
    if (moved) index++
    const target = moved ? fields[index++] : path
    counts.set(target, additions === "-" ? { additions: null, deletions: null } : { additions: Number(additions), deletions: Number(deletions) })
  }
  return counts
}

/**
 * The files of the branch checked out in `cwd` against `base`, from `git diff <base>...HEAD`: the status of each file from
 * `--name-status` and its counts from `--numstat`, joined by the new path. A binary file has `null` counts.
 */
export const gitFiles = ({ cwd, base }) => {
  const statuses = statusOf(git(cwd, ["diff", "-M", "--name-status", "-z", `${base}...HEAD`]))
  const counts = countsOf(git(cwd, ["diff", "-M", "--numstat", "-z", `${base}...HEAD`]))
  const files = []
  for (const [path, status] of statuses) {
    const count = counts.get(path)
    if (count === undefined) throw new Error(`git gave a status for ${path} and no count`)
    files.push({ path, status, ...count })
  }
  return files
}
