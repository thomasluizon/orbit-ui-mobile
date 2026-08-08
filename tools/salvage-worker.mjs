#!/usr/bin/env node
/** Finish a dead worker's already-written changes without broad staging or an invented test receipt. */

import { createHash } from "node:crypto"
import { lstatSync, readFileSync, readlinkSync, statSync, writeFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { runBounded } from "./lib/bounded-process.mjs"
import { readinessReceiptPath } from "./lib/readiness-receipt.mjs"
import { readRunState, writeRunState } from "./lib/run-state.mjs"

const USAGE = `usage: salvage-worker.mjs --issue ORB-N --repo <key> [--pr <number>] --worktree <path> --branch <name> --run-root <path> --test-command <json> --test-receipt <path> --message <text> --path <relative-path> [--path <relative-path> ...] [--command-timeout-seconds <s>]

The test-command file is {"command":"<executable>","args":["..."]}. The tool runs it in the
worktree and persists its real exit receipt before staging. Only repeated, explicitly named --path
values are staged. A failed test stages and pushes nothing. When a PR already exists, it is
registered with a repository-qualified readiness receipt before commit/push. When salvage happens
before PR creation, --pr is omitted and the output records that readiness registration is pending.

exit codes: 0 committed and pushed, 1 test/commit/push failure, 2 usage or environment error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const valuesOf = (flag) => process.argv.slice(2).flatMap((value, index, args) => value === flag ? [args[index + 1]] : [])
const argOf = (flag) => valuesOf(flag).at(0) ?? null
const valueFlags = new Set(["--issue", "--repo", "--pr", "--worktree", "--branch", "--run-root", "--test-command", "--test-receipt", "--message", "--path", "--command-timeout-seconds"])
const known = new Set([...valueFlags, "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, args) => value.startsWith("-") && !known.has(value) && !valueFlags.has(args[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issue = argOf("--issue")
const repoKey = argOf("--repo")
const prRaw = argOf("--pr")
const prNumber = prRaw === null ? null : Number(prRaw)
const worktree = resolve(argOf("--worktree") ?? "")
const branch = argOf("--branch")
const runRoot = resolve(argOf("--run-root") ?? "")
const testCommandPath = argOf("--test-command")
const testReceiptPath = argOf("--test-receipt")
const message = argOf("--message")
const commandTimeoutSeconds = Number(argOf("--command-timeout-seconds") ?? "45")
const paths = valuesOf("--path")
const normalizedPaths = []
if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "") || !repoKey || (prNumber !== null && (!Number.isInteger(prNumber) || prNumber < 1)) || !branch || !testCommandPath || !testReceiptPath || !message || paths.length === 0) fail(2, USAGE)
if (!Number.isFinite(commandTimeoutSeconds) || commandTimeoutSeconds <= 0) fail(2, "--command-timeout-seconds requires a positive number")
if (!isAbsolute(testCommandPath) || !isAbsolute(testReceiptPath)) fail(2, "--test-command and --test-receipt must be absolute scratchpad paths")
const receiptRelative = relative(worktree, resolve(testReceiptPath))
if (receiptRelative === "" || (!receiptRelative.startsWith("..") && !isAbsolute(receiptRelative))) fail(2, "--test-receipt must live outside the worker worktree")
for (const directory of [worktree, runRoot]) {
  try {
    if (!statSync(directory).isDirectory()) fail(2, `not a directory: ${directory}`)
  } catch {
    fail(2, `not a directory: ${directory}`)
  }
}
for (const path of paths) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "")
  const target = resolve(worktree, normalized)
  const canonical = relative(worktree, target).replaceAll("\\", "/")
  if (!normalized || normalized === "." || normalized === "-A" || normalized === "--all" || normalized.startsWith("../") || isAbsolute(path) || canonical.startsWith("..") || canonical !== normalized || normalized.startsWith(":") || normalized === ".git" || normalized.startsWith(".git/")) {
    fail(2, `--path must be an explicit relative worktree path, never broad staging: ${path}`)
  }
  normalizedPaths.push(normalized)
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
if (typeof config.repos?.[repoKey] !== "string") fail(2, `unknown repository key "${repoKey}"`)

let testOrder
try {
  testOrder = JSON.parse(readFileSync(testCommandPath, "utf8"))
} catch (error) {
  fail(2, `test command could not be read as JSON: ${error.message}`)
}
if (typeof testOrder?.command !== "string" || !testOrder.command || !Array.isArray(testOrder.args) || testOrder.args.some((value) => typeof value !== "string")) fail(2, "test command must contain command:string and args:string[]")

const git = async (args) => {
  const result = await runBounded(process.env.GIT_BIN || "git", ["-C", worktree, ...args], { timeoutMs: commandTimeoutSeconds * 1000 })
  if (result.timedOut) throw new Error(`git ${args[0]} timed out after ${commandTimeoutSeconds}s; the complete child process tree was terminated`)
  if (result.overflowed) throw new Error(`git ${args[0]} exceeded the output bound; the complete child process tree was terminated`)
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || `git ${args[0]} exited ${result.status}`).trim())
  return result.stdout
}
let testedHead = null
try {
  testedHead = (await git(["rev-parse", "HEAD"])).trim()
  const currentBranch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim()
  if (["main", "refs/heads/main"].includes(branch)) fail(2, `--branch may not name the protected main branch: ${branch}`)
  if (currentBranch !== branch) fail(2, `--branch must exactly match the worktree's checked-out branch (expected ${currentBranch}, received ${branch})`)
} catch (error) {
  fail(2, `worktree is not a readable git checkout: ${error.message}`)
}
const fingerprintPath = (path) => {
  const target = resolve(worktree, path)
  try {
    const stat = lstatSync(target)
    if (stat.isSymbolicLink()) return `symlink:${stat.mode}:${readlinkSync(target)}`
    if (stat.isFile()) return `file:${stat.mode}:${stat.size}:${createHash("sha256").update(readFileSync(target)).digest("hex")}`
    return `other:${stat.mode}:${stat.size}`
  } catch (error) {
    if (error?.code === "ENOENT") return "missing"
    throw error
  }
}
const testedPathFingerprints = Object.fromEntries(normalizedPaths.map((path) => [path, fingerprintPath(path)]))
const completedAt = new Date().toISOString()
let testExitCode = 0
try {
  const testResult = await runBounded(testOrder.command, testOrder.args, { cwd: worktree, timeoutMs: config.timeouts.hardCeilingMinutes * 60 * 1000 })
  if (testResult.timedOut || testResult.overflowed || testResult.error || testResult.status !== 0) testExitCode = 1
} catch (error) {
  testExitCode = 1
}
const mutatedPaths = normalizedPaths.filter((path) => fingerprintPath(path) !== testedPathFingerprints[path])
if (mutatedPaths.length > 0) testExitCode = 1
const testReceipt = { command: testOrder.command, args: testOrder.args, exitCode: testExitCode, testedHead, testedPathFingerprints, mutatedPaths, completedAt, worktree }
writeFileSync(testReceiptPath, `${JSON.stringify(testReceipt, null, 2)}\n`)
if (mutatedPaths.length > 0) fail(1, `workspace test mutated named paths; nothing was staged or pushed: ${mutatedPaths.join(", ")}`)
if (testExitCode !== 0) fail(1, "workspace test failed; nothing was staged or pushed")

let inventory
try {
  inventory = (await git(["status", "--porcelain", "--untracked-files=all"])).replace(/\s+$/, "").split(/\r?\n/).filter(Boolean)
} catch (error) {
  fail(2, `could not inventory dirty files: ${(error.stderr?.toString() || error.message).trim()}`)
}
let dirtyPaths
let untrackedPaths
try {
  untrackedPaths = new Set((await git(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/")))
  dirtyPaths = new Set([
    ...(await git(["diff", "--name-only", "-z"])).split("\0"),
    ...(await git(["diff", "--cached", "--name-only", "-z"])).split("\0"),
    ...untrackedPaths,
  ].filter(Boolean).map((path) => path.replaceAll("\\", "/")))
} catch (error) {
  fail(2, `could not enumerate exact dirty paths: ${(error.stderr?.toString() || error.message).trim()}`)
}
for (const path of normalizedPaths) {
  if (!dirtyPaths.has(path)) fail(2, `--path must name one exact dirty file from the inventory: ${path}`)
}

const namedPathSet = new Set(normalizedPaths)
// Never inherit an unrelated index from the dead worker. `git add -- <named paths>` adds to the
// existing index; it does not replace it, so a later `git commit` would otherwise publish every
// already-staged path even when the caller deliberately omitted it from --path.
const alreadyStaged = (await git(["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"))
const unnamedStaged = alreadyStaged.filter((path) => !namedPathSet.has(path))
if (unnamedStaged.length > 0) fail(2, `index contains staged paths not named by --path: ${unnamedStaged.join(", ")}`)

const unselectedSource = [...dirtyPaths].filter((path) => !namedPathSet.has(path) && !(untrackedPaths.has(path) && path.startsWith(".orca/")))
if (unselectedSource.length > 0) fail(2, `dirty source paths not named by --path would make the workspace test cover a different tree than the commit: ${unselectedSource.join(", ")}`)

const readinessPath = prNumber === null ? null : readinessReceiptPath(config.repos[repoKey], repoKey, prNumber)
if (prNumber !== null) {
  const state = readRunState(runRoot) ?? { sessionId: "salvage", sleep: false, remaining: [] }
  const pullRequests = Array.isArray(state.pullRequests) ? state.pullRequests.filter((entry) => !(entry?.repositoryKey === repoKey && entry?.prNumber === prNumber)) : []
  pullRequests.push({ repositoryKey: repoKey, prNumber, receiptPath: readinessPath })
  writeRunState({ ...state, pullRequests }, runRoot)
}

try {
  await git(["--literal-pathspecs", "add", "--", ...normalizedPaths])
  const staged = (await git(["diff", "--cached", "--name-only"])).trim()
  if (!staged) fail(1, "named paths produced no staged change")
  await git(["commit", "-m", message])
  await git(["push", "origin", `HEAD:${branch}`])
  const headSha = (await git(["rev-parse", "HEAD"])).trim()
  console.log(JSON.stringify({ issue, repositoryKey: repoKey, prNumber, branch, inventory, stagedPaths: staged.split(/\r?\n/), testReceiptPath, readinessPath, readinessRegistrationPending: prNumber === null, headSha }, null, 2))
} catch (error) {
  fail(1, `salvage commit/push failed: ${error.message}`)
}
