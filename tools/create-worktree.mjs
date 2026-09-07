#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"

const USAGE = `usage: create-worktree.mjs --repo path:<path> --name <name> --base-branch <branch> --issue <ticket> --no-parent --comment <text> --json

Serializes refresh and creation per repository; overlapping callers share a completed base fetch.
Fetches the requested remote base, refuses creation unless the local base is exactly that commit,
prints the selected commit, then delegates the unchanged arguments to orca worktree create.

exit codes: 0 created, 1 local and remote base differ, 2 usage error, 3 git or orca failed`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const args = process.argv.slice(2)
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  if (index === -1) return null
  const value = args[index + 1]
  return value === undefined || value.startsWith("-") ? undefined : value
}
const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
const knownFlags = new Set(["--repo", "--name", "--base-branch", "--issue", "--no-parent", "--comment", "--json"])
const unknown = args.filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const repoArgument = valueOf("--repo")
const baseBranch = valueOf("--base-branch")
if (repoArgument === undefined || baseBranch === undefined) fail(2, `${USAGE}\n\nflags require values`)
if (!repoArgument?.startsWith("path:") || !baseBranch) fail(2, `${USAGE}\n\n--repo path:<path> and --base-branch are required`)

const repository = resolve(repoArgument.slice("path:".length))
const requestedAt = Date.now()
const abort = (code, message) => { throw Object.assign(new Error(message), { exitCode: code }) }
const git = async (gitArgs, run = spawnSync) => {
  const result = await run(process.env.GIT_BIN || "git", ["-C", repository, ...gitArgs], { encoding: "utf8" })
  if (result.status !== 0) abort(3, `git ${gitArgs.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`)
  return result.stdout.trim()
}

const refreshBase = async (refreshPath, run) => {
  let previous = null
  try {
    previous = JSON.parse(readFileSync(refreshPath, "utf8"))
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  if (previous?.baseBranch !== baseBranch || previous.completedAt < requestedAt) await git(["fetch", "origin", baseBranch], run)
  let localCommit = await git(["rev-parse", `refs/heads/${baseBranch}`], run)
  const remoteCommit = await git(["rev-parse", `refs/remotes/origin/${baseBranch}`], run)
  if (localCommit !== remoteCommit) {
    const ancestor = await run(process.env.GIT_BIN || "git", ["-C", repository, "merge-base", "--is-ancestor", localCommit, remoteCommit])
    if (ancestor.status !== 0) abort(1, `refusing non-fast-forward base ${baseBranch}: local ${localCommit}, origin ${remoteCommit}`)
    const currentBranch = await git(["branch", "--show-current"], run)
    if (currentBranch === baseBranch) await git(["merge", "--ff-only", `origin/${baseBranch}`], run)
    else await git(["branch", "-f", baseBranch, `origin/${baseBranch}`], run)
    localCommit = await git(["rev-parse", `refs/heads/${baseBranch}`], run)
  }
  if (localCommit !== remoteCommit) abort(1, `refusing stale base ${baseBranch}: local ${localCommit}, origin ${remoteCommit}`)
  if (previous?.baseBranch !== baseBranch || previous.completedAt < requestedAt) {
    writeFileSync(refreshPath, JSON.stringify({ baseBranch, completedAt: Date.now() }))
  }
  console.log(`WORKTREE_BASE ${baseBranch} ${remoteCommit}`)
}

// Same OS identity as #437's run-state.mjs on redesign/main, which this branch predates.
const processStartIdentity = (pid) => {
  if (process.platform === "win32") {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks.ToString()`,
    ], { encoding: "utf8", windowsHide: true, timeout: 3000 })
    const ticks = result.stdout?.trim()
    return result.status === 0 && /^\d+$/.test(ticks) ? `win32:${ticks}` : null
  }
  if (process.platform === "linux") {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    const fields = stat.slice(stat.lastIndexOf(") ") + 2).trim().split(/\s+/)
    if (["Z", "X", "x"].includes(fields[0])) return false
    const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
    return /^\d+$/.test(fields[19]) && /^[0-9a-f-]{36}$/.test(bootId) ? `linux:${bootId}:${fields[19]}` : null
  }
  return null
}

const holderIsAlive = (holder) => {
  if (!Number.isInteger(holder.pid) || holder.pid <= 0 || typeof holder.processStartIdentity !== "string") {
    throw new Error("invalid repository lock identity")
  }
  try {
    process.kill(holder.pid, 0)
  } catch (error) {
    if (error.code === "ESRCH") return false
    if (error.code === "EPERM") return true
    throw error
  }
  try {
    const identity = processStartIdentity(holder.pid)
    // A denied metadata probe cannot prove that a live holder has been replaced.
    return identity === null || identity === holder.processStartIdentity
  } catch (error) {
    if (error.code === "ENOENT") return false
    if (error.code === "EACCES" || error.code === "EPERM") return true
    throw error
  }
}

const removeOwner = (lockPath, owner) => {
  try {
    unlinkSync(join(lockPath, owner))
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  try {
    rmdirSync(lockPath)
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error
  }
}

const reclaimLock = (lockPath) => {
  try {
    const owners = readdirSync(lockPath)
    for (const owner of owners) {
      if (!holderIsAlive(JSON.parse(readFileSync(join(lockPath, owner), "utf8")))) removeOwner(lockPath, owner)
    }
    if (owners.length === 0) rmdirSync(lockPath)
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error
  }
}

const acquireLock = async (lockPath) => {
  const identity = processStartIdentity(process.pid)
  if (!identity) abort(3, "cannot establish repository lock process identity")
  const candidate = mkdtempSync(`${lockPath}-`)
  const owner = basename(candidate)
  writeFileSync(join(candidate, owner), JSON.stringify({ pid: process.pid, processStartIdentity: identity }))
  try {
    while (true) {
      try {
        // Publish a populated directory atomically. Reclaimers can only delete the old owner's
        // unique filename; rmdir cannot remove a replacement holder's populated directory.
        renameSync(candidate, lockPath)
        return owner
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error
      }
      reclaimLock(lockPath)
      if (Date.now() - requestedAt > 120000) abort(3, `timed out waiting for repository lock ${lockPath}`)
      await setTimeout(50)
    }
  } finally {
    removeOwner(candidate, owner)
  }
}

const runLocked = async (lockPath, owner, command, commandArgs) => {
  // The gate cannot execute until its identity is published. EOF before authorization exits it.
  // Linux exec preserves the registered PID/start identity; Windows keeps a detached supervisor.
  const windowsGate = `
    const { spawnSync } = require("node:child_process")
    let authorization = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => { authorization += chunk })
    process.stdin.on("end", () => {
      if (authorization !== "run\\n") process.exit(3)
      const result = spawnSync(process.argv[1], process.argv.slice(2), { stdio: ["ignore", "inherit", "inherit"], windowsHide: true })
      if (result.error) throw result.error
      process.exit(result.status ?? 3)
    })
  `
  const child = process.platform === "win32"
    ? spawn(process.execPath, ["-e", windowsGate, command, ...commandArgs], { detached: true, windowsHide: true })
    : spawn("/bin/sh", ["-c", 'read -r authorization && [ "$authorization" = run ] && exec "$@"', "create-worktree", command, ...commandArgs], { detached: true })
  let stdout = ""
  let stderr = ""
  const completion = new Promise((resolve) => {
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", (error) => { stderr += error.message })
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
  const childOwner = `${owner}.${child.pid}`
  let candidate
  try {
    if (!child.pid) return await completion
    const identity = processStartIdentity(child.pid)
    if (!identity) abort(3, "cannot establish repository lock child identity")
    candidate = mkdtempSync(`${lockPath}-child-`)
    writeFileSync(join(candidate, childOwner), JSON.stringify({ pid: child.pid, processStartIdentity: identity }))
    renameSync(join(candidate, childOwner), join(lockPath, childOwner))
    child.stdin.end("run\n")
    return await completion
  } finally {
    child.stdin.destroy()
    await completion
    removeOwner(lockPath, childOwner)
    if (candidate) removeOwner(candidate, childOwner)
  }
}

const createWorktree = async () => {
  const commonDirectory = await git(["rev-parse", "--path-format=absolute", "--git-common-dir"])
  const lockPath = join(commonDirectory, "create-worktree.lock")
  const owner = await acquireLock(lockPath)
  try {
    const run = (command, commandArgs) => runLocked(lockPath, owner, command, commandArgs)
    await refreshBase(join(commonDirectory, "create-worktree-refresh.json"), run)
    const result = await run(process.env.ORCA_BIN || "orca", ["worktree", "create", ...args])
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.status !== 0) abort(3, `orca worktree create failed with exit ${result.status ?? "unknown"}`)
  } finally {
    removeOwner(lockPath, owner)
  }
}

try {
  await createWorktree()
} catch (error) {
  fail(error.exitCode ?? 3, error.message)
}
