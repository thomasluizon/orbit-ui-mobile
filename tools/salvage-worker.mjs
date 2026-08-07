#!/usr/bin/env node
/** Finish a dead worker's already-written changes without broad staging or an invented test receipt. */

import { execFileSync } from "node:child_process"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { readinessReceiptPath } from "./lib/readiness-receipt.mjs"
import { readRunState, writeRunState } from "./lib/run-state.mjs"

const USAGE = `usage: salvage-worker.mjs --issue ORB-N --repo <key> --pr <number> --worktree <path> --branch <name> --run-root <path> --test-command <json> --test-receipt <path> --message <text> --path <relative-path> [--path <relative-path> ...]

The test-command file is {"command":"<executable>","args":["..."]}. The tool runs it in the
worktree and persists its real exit receipt before staging. Only repeated, explicitly named --path
values are staged. A failed test stages and pushes nothing. The salvaged PR is registered with a
repository-qualified readiness receipt before commit/push.

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
const valueFlags = new Set(["--issue", "--repo", "--pr", "--worktree", "--branch", "--run-root", "--test-command", "--test-receipt", "--message", "--path"])
const known = new Set([...valueFlags, "--help", "-h"])
const unknown = process.argv.slice(2).filter((value, index, args) => value.startsWith("-") && !known.has(value) && !valueFlags.has(args[index - 1]))
if (unknown.length) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const issue = argOf("--issue")
const repoKey = argOf("--repo")
const prNumber = Number(argOf("--pr"))
const worktree = resolve(argOf("--worktree") ?? "")
const branch = argOf("--branch")
const runRoot = resolve(argOf("--run-root") ?? "")
const testCommandPath = argOf("--test-command")
const testReceiptPath = argOf("--test-receipt")
const message = argOf("--message")
const paths = valuesOf("--path")
const normalizedPaths = []
if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issue ?? "") || !repoKey || !Number.isInteger(prNumber) || prNumber < 1 || !branch || !testCommandPath || !testReceiptPath || !message || paths.length === 0) fail(2, USAGE)
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
  if (!normalized || normalized === "." || normalized === "-A" || normalized === "--all" || normalized.startsWith("../") || isAbsolute(path) || canonical.startsWith("..") || canonical !== normalized || /[*?[\]]/.test(normalized) || normalized.startsWith(":") || normalized === ".git" || normalized.startsWith(".git/")) {
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

const git = (args) => execFileSync(process.env.GIT_BIN || "git", ["-C", worktree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
let testedHead = null
try {
  testedHead = git(["rev-parse", "HEAD"]).trim()
} catch (error) {
  fail(2, `worktree is not a readable git checkout: ${(error.stderr?.toString() || error.message).trim()}`)
}
const completedAt = new Date().toISOString()
let testExitCode = 0
try {
  execFileSync(testOrder.command, testOrder.args, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30 * 60 * 1000, windowsHide: true })
} catch (error) {
  testExitCode = 1
}
const testReceipt = { command: testOrder.command, args: testOrder.args, exitCode: testExitCode, testedHead, completedAt, worktree }
writeFileSync(testReceiptPath, `${JSON.stringify(testReceipt, null, 2)}\n`)
if (testExitCode !== 0) fail(1, "workspace test failed; nothing was staged or pushed")

let inventory
try {
  inventory = git(["status", "--porcelain", "--untracked-files=all"]).replace(/\s+$/, "").split(/\r?\n/).filter(Boolean)
} catch (error) {
  fail(2, `could not inventory dirty files: ${(error.stderr?.toString() || error.message).trim()}`)
}
let dirtyPaths
try {
  dirtyPaths = new Set([
    ...git(["diff", "--name-only", "-z"]).split("\0"),
    ...git(["diff", "--cached", "--name-only", "-z"]).split("\0"),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"),
  ].filter(Boolean).map((path) => path.replaceAll("\\", "/")))
} catch (error) {
  fail(2, `could not enumerate exact dirty paths: ${(error.stderr?.toString() || error.message).trim()}`)
}
for (const path of normalizedPaths) {
  if (!dirtyPaths.has(path)) fail(2, `--path must name one exact dirty file from the inventory: ${path}`)
}

const readinessPath = readinessReceiptPath(config.repos[repoKey], repoKey, prNumber)
const state = readRunState(runRoot) ?? { sessionId: "salvage", sleep: false, remaining: [] }
const pullRequests = Array.isArray(state.pullRequests) ? state.pullRequests.filter((entry) => !(entry?.repositoryKey === repoKey && entry?.prNumber === prNumber)) : []
pullRequests.push({ repositoryKey: repoKey, prNumber, receiptPath: readinessPath })
writeRunState({ ...state, pullRequests }, runRoot)

try {
  git(["add", "--", ...normalizedPaths])
  const staged = git(["diff", "--cached", "--name-only"]).trim()
  if (!staged) fail(1, "named paths produced no staged change")
  git(["commit", "-m", message])
  git(["push", "origin", `HEAD:${branch}`])
  const headSha = git(["rev-parse", "HEAD"]).trim()
  console.log(JSON.stringify({ issue, repositoryKey: repoKey, prNumber, branch, inventory, stagedPaths: staged.split(/\r?\n/), testReceiptPath, readinessPath, headSha }, null, 2))
} catch (error) {
  fail(1, `salvage commit/push failed: ${(error.stderr?.toString() || error.message).trim()}`)
}
