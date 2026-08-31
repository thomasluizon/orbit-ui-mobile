#!/usr/bin/env node
/** Submit one cloud implementation and persist the state needed to recover it after a crash. */

import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"

import { dashFindings } from "./check-dashes.mjs"
import {
  CodexTimeoutError,
  acquireSubmissionLock,
  cloudOrder,
  cloudStateRoot,
  listCloudTasks,
  mirrorPathFor,
  parseTaskUrl,
  persistReceipt,
  readJsonFile,
  refreshReceipts,
  runCodex,
} from "./lib/cloud-worker.mjs"
import { resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: submit-cloud-worker.mjs --issue <ORB-N|#N|N> --env <environment-id> --branch <name> --order <file> --worktree <path>

Submits one task with the order as one shell-free argument, then writes a receipt beside the order
and mirrors it under the repository's shared Git directory. It checks the stable receipts once to
derive the current in-flight set and enforce caps.cloudParallelTasks. It never waits for completion,
applies a diff, commits, pushes, or opens a pull request.

exit codes: 0 submitted and receipt persisted, 1 cloud or Git command failed,
            2 usage, configuration, order, or worktree error, 3 cloud capacity is full,
            4 a Codex cloud command timed out

  --help, -h  print this usage and exit 0`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const valueFlags = new Set(["--issue", "--env", "--branch", "--order", "--worktree"])
const knownFlags = new Set([...valueFlags, "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !knownFlags.has(value) && !valueFlags.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
const argOf = (flag) => {
  const index = argv.indexOf(flag)
  return index === -1 ? null : argv[index + 1]
}

let ticket
try {
  const resolved = resolveTicket(argOf("--issue"))
  ticket = resolved.identifier ?? `#${resolved.number}`
} catch (error) {
  fail(2, `${USAGE}\n\n--issue must be ORB-N, #N, or N: ${error.message}`)
}
const environmentId = argOf("--env")
const branch = argOf("--branch")
const orderArgument = argOf("--order")
const worktreeArgument = argOf("--worktree")
for (const [flag, value] of [["--env", environmentId], ["--branch", branch], ["--order", orderArgument], ["--worktree", worktreeArgument]]) {
  if (!value || value.startsWith("--")) fail(2, `${USAGE}\n\n${flag} is required`)
}

const worktree = resolve(worktreeArgument)
const orderFile = resolve(orderArgument)
if (!existsSync(worktree) || !statSync(worktree).isDirectory()) fail(2, `worktree not found: ${worktree}`)
if (!existsSync(orderFile) || !statSync(orderFile).isFile()) fail(2, `order file not found: ${orderFile}`)
const orderRelative = relative(worktree, orderFile)
const orderIsInsideWorktree = orderRelative === "" || (
  orderRelative !== ".." && !orderRelative.startsWith(`..${sep}`) && !isAbsolute(orderRelative)
)
if (orderIsInsideWorktree) {
  fail(2, `order file lives inside ${worktree}; cloud work orders belong in the session scratchpad`)
}

const orderText = readFileSync(orderFile, "utf8")
if (orderText.length === 0) fail(2, `order file is empty: ${orderFile}`)
const findings = dashFindings(orderText, { allowNumericRanges: false })
if (findings.length > 0) {
  const kinds = [...new Set(findings.map((finding) => finding.kind))].join(", ")
  fail(2, `order file contains a banned ${kinds}; it would fail the container commit before producing a diff`)
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
if (config.cloud.environmentId !== environmentId) {
  fail(2, `--env must match .claude/orchestrator.json cloud.environmentId (${config.cloud.environmentId})`)
}
const codexCommand = config.workers.codex?.command
if (typeof codexCommand !== "string" || codexCommand.length === 0) fail(2, ".claude/orchestrator.json declares no codex command")
const codexTimeoutMs = config.timeouts.cloudCommandMinutes * 60 * 1000

let stateRoot
try {
  stateRoot = cloudStateRoot(worktree)
} catch (error) {
  fail(2, error.message)
}

const remote = spawnSync("git", ["-C", worktree, "ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], {
  encoding: "utf8",
  windowsHide: true,
})
if (remote.error || remote.status !== 0) {
  fail(1, `git ls-remote could not resolve origin/${branch}: ${(remote.stderr || remote.error?.message || "unknown error").trim()}`)
}
const remoteLines = remote.stdout.trim().split(/\r?\n/).filter(Boolean)
const remoteMatch = remoteLines.length === 1 ? /^([0-9a-f]{40})\s+refs\/heads\/(.+)$/.exec(remoteLines[0]) : null
if (!remoteMatch || remoteMatch[2] !== branch) fail(1, `git ls-remote returned an unexpected response for origin/${branch}`)
const baseSha = remoteMatch[1]

let releaseLock
try {
  releaseLock = acquireSubmissionLock(stateRoot)
} catch (error) {
  fail(2, error.message)
}
process.once("exit", releaseLock)

const receiptsDirectory = join(stateRoot, "receipts")
let existingReceipts = []
if (existsSync(receiptsDirectory)) {
  try {
    existingReceipts = readdirSync(receiptsDirectory)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFile(join(receiptsDirectory, entry), "cloud receipt"))
      .filter((receipt) => receipt.environmentId === environmentId)
  } catch (error) {
    fail(2, error.message)
  }
}

if (existingReceipts.length > 0) {
  try {
    const tasks = await listCloudTasks(codexCommand, environmentId, { timeoutMs: codexTimeoutMs })
    const refreshed = refreshReceipts(existingReceipts, tasks)
    for (const receipt of refreshed.receipts) {
      persistReceipt(receipt, [mirrorPathFor(stateRoot, receipt.taskId)])
    }
    if (refreshed.inFlight.length >= config.caps.cloudParallelTasks) {
      fail(
        3,
        `cloud capacity is full: ${refreshed.inFlight.length}/${config.caps.cloudParallelTasks} tasks are in flight`,
      )
    }
  } catch (error) {
    if (error instanceof CodexTimeoutError) fail(4, error.message)
    fail(1, error.message)
  }
}

const submittedOrder = cloudOrder(orderText)
const submittedAt = new Date()
const result = await runCodex(codexCommand, ["cloud", "exec", "--env", environmentId, "--branch", branch, submittedOrder], {
  timeoutMs: codexTimeoutMs,
})
if (result.timedOut) fail(4, `codex cloud exec timed out after ${codexTimeoutMs}ms`)
if (result.error || result.status !== 0) {
  fail(1, `codex cloud exec failed with exit ${result.status ?? "spawn"}: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`)
}

let task
try {
  task = parseTaskUrl(result.stdout)
} catch (error) {
  fail(1, error.message)
}
const orderName = basename(orderFile, extname(orderFile))
const receiptPath = join(dirname(orderFile), `${orderName}-${task.taskId}.cloud-receipt.json`)
const mirrorPath = mirrorPathFor(stateRoot, task.taskId)
const receipt = {
  taskId: task.taskId,
  taskUrl: task.taskUrl,
  environmentId,
  ticket,
  branch,
  baseSha,
  orderSha256: createHash("sha256").update(orderText).digest("hex"),
  submittedOrderSha256: createHash("sha256").update(submittedOrder).digest("hex"),
  orderFile,
  worktree,
  submittedAt: submittedAt.toISOString(),
  deadline: new Date(submittedAt.getTime() + config.timeouts.cloudCeilingMinutes * 60 * 1000).toISOString(),
  receiptPath,
  mirrorPath,
}
try {
  persistReceipt(receipt, [receiptPath, mirrorPath])
} catch (error) {
  fail(1, `cloud task ${task.taskId} was submitted but its receipt could not be persisted: ${error.message}`)
}
releaseLock()
console.log(JSON.stringify(receipt))
