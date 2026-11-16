/**
 * The read-only worker mode of tools/launch-worker.mjs: a review or a device proof that writes nothing
 * tracked in any repository it can reach. Git hooks scoped to the protected repositories record and
 * refuse each ref update and push of the worker's own git processes, so each one is attributed to the
 * worker. A before and after snapshot of each worktree finds a changed tracked file, which no hook sees.
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { join, relative, resolve, isAbsolute } from "node:path"

import { parseWorktreeList } from "./git-worktrees.mjs"
import { researchPaths } from "./research-run.mjs"

/** The first line of each result. tools/compose-prompt.mjs writes the same lines into each order. */
export const REVIEW_VERDICT_LINE = /^VERDICT: (?:CLEAN|DEFECTS \(\d+\))$/
export const PROOF_VERDICT_LINE = /^PROOF: (?:PASS|FAIL \(\d+ defects?\))$/

/** The verdict line of a result in `mode` ("review" or "proof"), or null when the first line is not one. */
export const resultVerdict = (text, mode) => {
  const first = String(text ?? "").split(/\r?\n/, 1)[0].trim()
  return (mode === "proof" ? PROOF_VERDICT_LINE : REVIEW_VERDICT_LINE).test(first) ? first : null
}

const ZERO_OBJECT = /^0+$/

const git = (directory, args) => spawnSync("git", ["-C", directory, ...args], {
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
  // A status in another worker's worktree must never take that worktree's index lock.
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
})

const inside = (path, directory) => {
  const relation = relative(directory, path)
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))
}

/**
 * The checked order, output and run directory of a read-only run. The order and the output follow the
 * research rules: outside every repository, and the output a new file. The run directory is a worktree
 * root, such as a detached worktree at the head under review, or a copy outside every repository.
 */
export const readOnlyPaths = (orderArgument, outputArgument, directoryArgument, mode) => {
  if (!directoryArgument || directoryArgument.startsWith("--")) throw new Error(`--directory is required for --${mode}`)
  const { orderFile, outputFile } = researchPaths(orderArgument, outputArgument, mode)
  let runDirectory
  try { runDirectory = realpathSync(resolve(directoryArgument)) } catch { throw new Error(`run directory not found: ${directoryArgument}`) }
  if (!statSync(runDirectory).isDirectory()) throw new Error(`run directory is not a directory: ${runDirectory}`)
  for (const [label, path] of [["order", orderFile], ["output", outputFile]]) {
    if (inside(path, runDirectory)) throw new Error(`${label} lives inside the run directory ${runDirectory}; keep it in the scratchpad`)
  }
  const topLevel = git(runDirectory, ["rev-parse", "--show-toplevel"])
  if (topLevel.status === 0 && realpathSync(topLevel.stdout.trim()) !== runDirectory) {
    throw new Error(`run directory ${runDirectory} is inside a repository but is not a worktree root`)
  }
  return { orderFile, outputFile, runDirectory, gitWorktree: topLevel.status === 0 }
}

/** The real common git directory of the repository that holds `directory`, or null outside every repository. */
export const commonGitDirectory = (directory) => {
  if (!existsSync(directory)) return null
  const result = git(directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  if (result.status !== 0) return null
  try { return realpathSync(result.stdout.trim()) } catch { return null }
}

const shellWord = (value) => `'${String(value).replaceAll("'", "'\\''")}'`

const HOOK_SCRIPT = `const { appendFileSync, readFileSync } = require("node:fs")
const [kind, log, ...args] = process.argv.slice(2)
const input = readFileSync(0, "utf8")
const record = (entry) => appendFileSync(log, JSON.stringify({ ...entry, directory: process.cwd() }) + "\\n")
if (kind === "pre-push") {
  record({ kind: "push", remote: args[0] ?? null, refs: input.split("\\n").filter(Boolean) })
  process.exit(1)
}
// Git 2.55 calls this hook in a "preparing" state before "prepared"; older Git has only "prepared".
if (!["preparing", "prepared"].includes(args[0])) process.exit(0)
const updates = input.split("\\n").filter(Boolean).map((line) => line.split(" "))
  .filter(([oldValue, newValue, ref]) => oldValue !== newValue && !ref.startsWith("refs/remotes/") &&
    !(ref.startsWith("refs/tags/") && /^0+$/.test(oldValue)))
if (updates.length === 0) process.exit(0)
record({ kind: "ref-update", refs: updates.map(([oldValue, newValue, ref]) => ({ ref, oldValue, newValue })) })
process.exit(1)
`

/**
 * Hooks that record and refuse writes in the protected repositories only, through the environment
 * configuration that every git process of the worker reads. Per repository, the bare `includeIf.gitdir`
 * pattern matches the primary checkout and the trailing slash matches each linked worktree. Other
 * repositories keep their own hooks. A fetch may update `refs/remotes/` and create a tag.
 */
export const installWriteGuard = (commonDirectories, guardDirectory, environment = process.env) => {
  const hooksDirectory = join(guardDirectory, "hooks")
  mkdirSync(hooksDirectory, { recursive: true })
  const logFile = join(guardDirectory, "writes.jsonl")
  writeFileSync(logFile, "")
  const hookScript = join(guardDirectory, "record-write.cjs")
  writeFileSync(hookScript, HOOK_SCRIPT)
  for (const hook of ["reference-transaction", "pre-push"]) {
    const path = join(hooksDirectory, hook)
    writeFileSync(path, `#!/bin/sh\nexec ${shellWord(process.execPath)} ${shellWord(hookScript)} ${hook} ${shellWord(logFile)} "$@"\n`)
    chmodSync(path, 0o755)
  }
  const includedConfig = join(guardDirectory, "guard.gitconfig")
  writeFileSync(includedConfig, `[core]\n\thooksPath = ${hooksDirectory.replaceAll("\\", "/")}\n`)
  const existing = Number(environment.GIT_CONFIG_COUNT)
  let index = Number.isInteger(existing) && existing > 0 ? existing : 0
  const variables = {}
  const condition = process.platform === "win32" ? "gitdir/i" : "gitdir"
  for (const directory of new Set(commonDirectories)) {
    const pattern = directory.replaceAll("\\", "/")
    for (const suffix of ["", "/"]) {
      variables[`GIT_CONFIG_KEY_${index}`] = `includeIf.${condition}:${pattern}${suffix}.path`
      variables[`GIT_CONFIG_VALUE_${index}`] = includedConfig
      index += 1
    }
  }
  return { logFile, environment: { ...variables, GIT_CONFIG_COUNT: String(index) } }
}

/** Each write the guard recorded: a push, a new branch, or another ref update such as a commit. */
export const recordedWrites = (logFile) => {
  let text = ""
  try { text = readFileSync(logFile, "utf8") } catch { return [] }
  return text.split("\n").filter(Boolean).flatMap((line) => {
    let entry
    try { entry = JSON.parse(line) } catch { return [{ kind: "unreadable-guard-record", directory: null, detail: line }] }
    if (entry.kind === "push") return [{ kind: "push", directory: entry.directory, detail: `${entry.remote ?? "unknown remote"}: ${entry.refs.join("; ")}` }]
    return entry.refs.map(({ ref, oldValue, newValue }) => ({
      kind: ref.startsWith("refs/heads/") && ZERO_OBJECT.test(oldValue) ? "new-branch" : "ref-update",
      directory: entry.directory,
      detail: `${ref} ${oldValue} -> ${newValue}`,
    }))
  })
}

const STATUS_ARGUMENTS = ["-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--untracked-files=no", "--ignore-submodules=none"]

/** Each changed tracked path of a worktree, keyed to its status code and content hash, or null when git cannot read it. */
const trackedChanges = (worktree) => {
  const result = git(worktree, STATUS_ARGUMENTS)
  if (result.status !== 0) return null
  const entries = result.stdout.split("\0")
  const changes = {}
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.length < 4) continue
    const code = entry.slice(0, 2)
    const path = entry.slice(3)
    // A rename or a copy carries its source path as the next entry.
    if (code[0] === "R" || code[0] === "C") index += 1
    let content = "absent"
    try { content = createHash("sha1").update(readFileSync(join(worktree, path))).digest("hex") } catch { /* a deleted path has no content */ }
    changes[path] = `${code}:${content}`
  }
  return changes
}

/**
 * Each worktree of each repository: its HEAD and its changed tracked paths. `isOccupied(path)` marks a
 * worktree that another live launcher holds, whose own worker legitimately writes there.
 */
export const snapshotWorktrees = (repositoryDirectories, isOccupied) => {
  const snapshot = new Map()
  for (const repository of repositoryDirectories) {
    const listed = git(repository, ["worktree", "list", "--porcelain"])
    if (listed.status !== 0) continue
    for (const worktree of parseWorktreeList(listed.stdout)) {
      if (!worktree.path || worktree.prunable) continue
      let path
      try { path = realpathSync(worktree.path) } catch { continue }
      if (snapshot.has(path)) continue
      const head = git(path, ["rev-parse", "HEAD"])
      snapshot.set(path, { head: head.status === 0 ? head.stdout.trim() : null, tracked: trackedChanges(path), occupied: isOccupied(path) })
    }
  }
  return snapshot
}

/**
 * The writes between two snapshots: a changed tracked path in a worktree that no other live launcher
 * holds, and a moved HEAD in the run directory. A worktree in only one snapshot was added or removed
 * by somebody else. The hooks already cover the worker's own git writes in every other worktree.
 */
export const writesBetween = (before, after, runDirectory) => {
  const writes = []
  for (const [path, earlier] of before) {
    const later = after.get(path)
    if (!later || earlier.occupied || later.occupied) continue
    if (path === runDirectory && earlier.head !== later.head) {
      writes.push({ kind: "commit", directory: path, detail: `HEAD ${earlier.head} -> ${later.head}` })
    }
    if (earlier.tracked === null || later.tracked === null) continue
    const paths = [...new Set([...Object.keys(earlier.tracked), ...Object.keys(later.tracked)])]
      .filter((file) => earlier.tracked[file] !== later.tracked[file]).sort()
    if (paths.length > 0) writes.push({ kind: "tracked-change", directory: path, detail: paths.join(", ") })
  }
  return writes
}
