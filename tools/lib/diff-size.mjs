/**
 * The one count of the size of a change, and the one cap. The count is additions plus deletions. These count 0: a file
 * deleted whole, a rename with no content change, a binary file, a generated file and a file that a replay script proves.
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { findProjectTests } from "../../apps/web/vitest/project-tests.mjs"

export const MAX_CHANGED_LINES = 400
export const SOFT_CHANGED_LINES = 300
export const TARGET_CHANGED_LINES = 200
export const MAX_CHANGED_FILES = 30
export const MAX_DELETED_CHROMIUM_TESTS = 3

/** The files that a tool writes, so no reviewer reads them. Each entry matches a whole path. */
export const GENERATED = Object.freeze([
  /^apps\/web\/vitest\/shard-timings\.json$/,
  /^\.github\/layout-shard-timings\.json$/,
  /(?:^|\/)package-lock\.json$/,
  /(?:^|\/)__snapshots__\/[^/]*\.snap$/,
])

/** A deleted file: the git letter, the GitHub REST `status` and the GitHub GraphQL `changeType`. */
const DELETED = new Set(["D", "removed", "DELETED"])

const WEB_ROOT = "apps/web/"
const WEB_TEST = /^apps\/web\/__tests__\/.*\.test\.tsx?$/
/** git calls a file binary when a NUL byte is in its first 8,000 bytes. */
const BINARY_PROBE_BYTES = 8000
const REPLAY_TIMEOUT_MS = 120_000
const OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024
const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

const git = (cwd, args, encoding = "utf8") => {
  const result = spawnSync("git", args, { cwd, encoding, windowsHide: true, maxBuffer: OUTPUT_LIMIT_BYTES })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr || result.error?.message || "").trim()}`)
  return result.stdout
}

const topLevel = (cwd) => git(cwd, ["rev-parse", "--show-toplevel"]).trim()

/**
 * The commit that a change starts from. During a merge, the merged commit counts as a head too, so the lines that arrive
 * from `base` are not lines of this change.
 */
const mergeBaseOf = (cwd, base, head = "HEAD") => {
  const merging = head === "HEAD" && existsSync(join(git(cwd, ["rev-parse", "--absolute-git-dir"]).trim(), "MERGE_HEAD"))
  return git(cwd, ["merge-base", base, head, ...(merging ? ["MERGE_HEAD"] : [])]).trim()
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
    const binary = additions === "-"
    counts.set(target, { additions: binary ? 0 : Number(additions), deletions: binary ? 0 : Number(deletions), binary })
  }
  return counts
}

const untrackedPaths = (top) => git(top, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean)

/** What git would store for an untracked path: the target of a link, the bytes of a file, and nothing for a nested repository. */
const untrackedContent = (top, path) => {
  const full = join(top, path)
  const stats = lstatSync(full)
  if (stats.isSymbolicLink()) return Buffer.from(readlinkSync(full))
  return stats.isFile() ? readFileSync(full) : Buffer.alloc(0)
}

const untrackedFile = (top, path) => {
  const content = untrackedContent(top, path)
  const binary = content.subarray(0, BINARY_PROBE_BYTES).includes(0)
  const lines = content.toString("latin1").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return { path, status: "untracked", additions: binary ? 0 : lines.length, deletions: 0, binary }
}

/**
 * One `{ path, status, additions, deletions, binary }` for each path of the worktree at `cwd` that differs from the merge
 * base with `base` (committed, staged or not), then one for each untracked file. On a clean worktree this is the diff of
 * `<base>...HEAD`.
 */
export const gitFiles = ({ cwd, base }) => {
  const top = topLevel(cwd)
  const from = mergeBaseOf(top, base)
  const statuses = statusOf(git(top, ["diff", "-M", "--name-status", "-z", from, "--"]))
  const counts = countsOf(git(top, ["diff", "-M", "--numstat", "-z", from, "--"]))
  const tracked = [...statuses].map(([path, status]) => {
    const count = counts.get(path)
    if (count === undefined) throw new Error(`git gave a status for ${path} and no count`)
    return { path, status, ...count }
  })
  return [...tracked, ...untrackedPaths(top).map((path) => untrackedFile(top, path))]
}

const fileLines = ({ path, status, additions, deletions, binary }, proved) =>
  binary || DELETED.has(status) || proved.has(path) || GENERATED.some((pattern) => pattern.test(path)) ? 0 : additions + deletions

/** The changed lines of a list of files, from `gitFiles` or from a pull request. A pure rename has 0 and 0, so it counts 0. */
export const changedLines = (files, { proved = new Set() } = {}) => files.reduce((sum, file) => sum + fileLines(file, proved), 0)

/** The paths with a count above 0. */
export const changedFiles = (files, { proved = new Set() } = {}) =>
  [...new Set(files.filter((file) => fileLines(file, proved) > 0).map(({ path }) => path))]

/**
 * The deleted test files of the web `chromium` project. A deleted file is gone from the worktree, so `findProjectTests`
 * reads a copy of each one from the merge base of `base` and `head` in `cwd`.
 */
export const deletedChromiumTests = (files, { cwd, base, head } = {}) => {
  const deleted = files.filter(({ path, status }) => DELETED.has(status) && WEB_TEST.test(path))
  if (deleted.length === 0) return []
  if (!cwd || !base) throw new Error("deletedChromiumTests needs cwd and base to read each deleted test file")
  const from = mergeBaseOf(cwd, base, head)
  const webRoot = mkdtempSync(join(tmpdir(), "orbit-diff-size-"))
  try {
    for (const { path } of deleted) {
      const copy = join(webRoot, path.slice(WEB_ROOT.length))
      mkdirSync(dirname(copy), { recursive: true })
      writeFileSync(copy, git(cwd, ["show", `${from}:${path}`], "buffer"))
    }
    return findProjectTests(webRoot).chromiumTests.map((file) => `${WEB_ROOT}${file}`)
  } finally {
    rmSync(webRoot, { recursive: true, force: true })
  }
}

/** Why a change is over the cap, or an empty list. `options` holds `proved`, and `cwd`, `base` and `head` for a deleted test. */
export const overCap = (files, options = {}) => {
  const lines = changedLines(files, options)
  const count = changedFiles(files, options).length
  const tests = deletedChromiumTests(files, options).length
  return [
    lines > MAX_CHANGED_LINES && `size-over-cap:${lines}`,
    count > MAX_CHANGED_FILES && `files-over-cap:${count}`,
    tests > MAX_DELETED_CHROMIUM_TESTS && `chromium-deletions-over-cap:${tests}`,
  ].filter(Boolean)
}

/** A hash of all that a replay script can read of the change: the script list, the diff and each untracked file. */
const diffHash = (top, base, scripts) => {
  const hash = createHash("sha256").update(JSON.stringify(scripts))
  hash.update(git(top, ["diff", "--binary", "--full-index", "--no-ext-diff", "--no-textconv", mergeBaseOf(top, base), "--"], "buffer"))
  for (const path of untrackedPaths(top)) {
    const content = untrackedContent(top, path)
    hash.update(`\0${path}\0${content.length}\0`).update(content)
  }
  return hash.digest("hex")
}

const replay = (script, cwd, base) => {
  const result = spawnSync(process.execPath, [script, "--replay", "--base", base],
    { cwd, encoding: "utf8", windowsHide: true, timeout: REPLAY_TIMEOUT_MS, maxBuffer: OUTPUT_LIMIT_BYTES })
  if (result.status !== 0) throw new Error(`replay script ${script} failed: ${(result.stderr || result.error?.message || "").trim()}`)
  return result.stdout.split(/\r?\n/).filter(Boolean)
}

/**
 * The paths that the scripts of `tools/replay-scripts.json` prove for the change in `cwd`. The list and its scripts come
 * from `root`, the checkout that holds this module, so the change under the count cannot prove itself.
 */
export const provedPaths = ({ cwd, base, root = REPOSITORY_ROOT }) => {
  const scripts = JSON.parse(readFileSync(join(root, "tools", "replay-scripts.json"), "utf8"))
  if (scripts.length === 0) return new Set()
  const top = topLevel(cwd)
  const key = { base: git(top, ["rev-parse", "--verify", `${base}^{commit}`]).trim(), diff: diffHash(top, base, scripts) }
  const cacheFile = join(git(top, ["rev-parse", "--absolute-git-dir"]).trim(), "orbit-proved.json")
  const cached = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : null
  if (cached?.base === key.base && cached.diff === key.diff) return new Set(cached.paths)
  const paths = scripts.flatMap((script) => replay(join(root, script), top, base))
  // The rename is atomic, so a hook that runs at the same time never reads half a file.
  writeFileSync(`${cacheFile}.${process.pid}`, JSON.stringify({ ...key, paths }))
  renameSync(`${cacheFile}.${process.pid}`, cacheFile)
  return new Set(paths)
}
