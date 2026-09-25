#!/usr/bin/env node
import { setTimeout as wait } from "node:timers/promises"

import { githubEnvironment, redactSecrets, repositorySlug } from "./lib/github-auth.mjs"
import { readGithub } from "./lib/admission.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-ci.mjs --repo <key> --pr <n> [--pr <n> ...] [--require-check <name> ...] [--ceiling-minutes <n>]

Watch every named pull request's current head through GitHub REST checks and commit statuses.
Exit when all checks settle, a head moves, a pull request closes, or the ceiling expires.
--help, -h print this usage.
exit codes: 0 settled, head moved, or pull request closed; 1 GitHub read or wake registration failed;
            2 invalid arguments or config; 3 ceiling reached; 130 SIGINT; 143 SIGTERM`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const args = process.argv.slice(2)
const values = { "--repo": [], "--pr": [], "--require-check": [], "--ceiling-minutes": [] }
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index]
  const value = args[index + 1]
  if (!(flag in values) || !value || value.startsWith("--")) {
    console.error(USAGE)
    process.exit(2)
  }
  values[flag].push(value)
}
const repositoryKey = values["--repo"][0]
const pullRequests = values["--pr"].map(Number)
if (values["--repo"].length !== 1 || pullRequests.length === 0 ||
    pullRequests.some((number) => !Number.isInteger(number) || number <= 0) ||
    values["--ceiling-minutes"].length > 1) {
  console.error(USAGE)
  process.exit(2)
}
let config
try { config = readOrchestratorConfig() } catch (error) {
  console.error(error.message)
  process.exit(2)
}
const repositoryPath = config.repos[repositoryKey]
const ceilingMinutes = values["--ceiling-minutes"].length
  ? Number(values["--ceiling-minutes"][0]) : config.timeouts.hardCeilingMinutes
if (!repositoryPath || !Number.isFinite(ceilingMinutes) || ceilingMinutes <= 0) {
  console.error(`invalid repository key or ceiling: ${repositoryKey}`)
  process.exit(2)
}

const result = {
  repositoryKey,
  pullRequests: [...new Set(pullRequests)].map((number) => ({ number, head: null, settled: false, failingChecks: [], reason: null })),
  reason: null,
}
let finished = false
const finish = (reason, code, error = null) => {
  if (finished) return
  finished = true
  clearWakeSource(process.pid)
  result.reason = reason
  for (const entry of result.pullRequests) entry.reason ??= reason
  if (error) result.error = redactSecrets(error)
  console.log(JSON.stringify(result))
  process.exit(code)
}
process.once("exit", () => clearWakeSource(process.pid))
process.once("SIGINT", () => finish("SIGINT", 130))
process.once("SIGTERM", () => finish("SIGTERM", 143))
if (!registerWakeSource({ pid: process.pid, what: `CI ${repositoryKey} pull requests ${result.pullRequests.map((entry) => `#${entry.number}`).join(", ")}`, startedAt: new Date().toISOString() })) {
  finish("WAKE_REGISTRATION_FAILED", 1)
}

const requiredChecks = [...new Set(values["--require-check"])]
const deadline = Date.now() + ceilingMinutes * 60_000
try {
  const auth = await githubEnvironment(repositoryPath)
  const slug = repositorySlug(repositoryPath)
  const read = (path) => readGithub(`repos/${slug}/${path}`, auth.environment)
  const checksForHead = async (sha) => {
    const checks = []
    for (let page = 1; ; page += 1) {
      const response = await read(`commits/${sha}/check-runs?per_page=100&page=${page}`)
      if (!Number.isInteger(response?.total_count) || !Array.isArray(response.check_runs)) {
        throw new Error("GitHub check runs had an unexpected shape")
      }
      checks.push(...response.check_runs)
      if (checks.length >= response.total_count) break
      if (response.check_runs.length === 0) throw new Error("GitHub check runs pagination stopped early")
    }
    return checks
  }
  const runsForHead = async (sha) => {
    const runs = []
    for (let page = 1; ; page += 1) {
      const response = await read(`actions/runs?head_sha=${sha}&per_page=100&page=${page}`)
      if (!Number.isInteger(response?.total_count) || !Array.isArray(response.workflow_runs) ||
          response.workflow_runs.some((run) => typeof run?.status !== "string")) {
        throw new Error("GitHub workflow runs had an unexpected shape")
      }
      runs.push(...response.workflow_runs)
      if (runs.length >= response.total_count) break
      if (response.workflow_runs.length === 0) throw new Error("GitHub workflow runs pagination stopped early")
    }
    return runs
  }
  // The combined status endpoint pages at 30 by default, so one page can hide a pending context.
  const statusesForHead = async (sha) => {
    const statuses = []
    for (let page = 1; ; page += 1) {
      const response = await read(`commits/${sha}/status?per_page=100&page=${page}`)
      if (!Number.isInteger(response?.total_count) || !Array.isArray(response.statuses)) {
        throw new Error("GitHub commit statuses had an unexpected shape")
      }
      statuses.push(...response.statuses)
      if (statuses.length >= response.total_count) break
      if (response.statuses.length === 0) throw new Error("GitHub commit statuses pagination stopped early")
    }
    return statuses
  }
  /**
   * A head is settled only when the same completed set is seen on two consecutive quiet polls, with no
   * workflow run for that head still queued or running. A fast check can finish before a slower
   * workflow has registered its checks (Pullfrog on PR 1091, twice), and a workflow run exists from
   * dispatch, before any of its check runs does.
   */
  const lastQuietSet = new Map()
  while (!finished) {
    for (const entry of result.pullRequests) {
      const pull = await read(`pulls/${entry.number}`)
      if (typeof pull?.head?.sha !== "string" || !["open", "closed"].includes(pull.state)) {
        throw new Error(`GitHub pull request #${entry.number} had an unexpected shape`)
      }
      if (entry.head === null) entry.head = pull.head.sha
      if (pull.state !== "open") {
        entry.reason = "PR_CLOSED"
        finish("PR_CLOSED", 0)
      }
      if (entry.head !== pull.head.sha) {
        entry.reason = "HEAD_MOVED"
        finish("HEAD_MOVED", 0)
      }
      const checks = await checksForHead(entry.head)
      const statuses = await statusesForHead(entry.head)
      if (checks.some((check) => typeof check.name !== "string" || typeof check.status !== "string" || !("conclusion" in check)) ||
          statuses.some((item) => typeof item.context !== "string" || !["pending", "success", "failure", "error"].includes(item.state))) {
        throw new Error("GitHub checks or statuses had an unexpected shape")
      }
      const pending = checks.some((check) => check.status !== "completed" || check.conclusion === null) ||
        statuses.some((item) => item.state === "pending")
      const completedNames = new Set([
        ...checks.filter((check) => check.status === "completed" && check.conclusion !== null).map((check) => check.name),
        ...statuses.filter((item) => item.state !== "pending").map((item) => item.context),
      ])
      entry.failingChecks = [
        ...checks.filter((check) => check.status === "completed" && !["success", "neutral", "skipped"].includes(check.conclusion)).map((check) => check.name),
        ...statuses.filter((item) => ["failure", "error"].includes(item.state)).map((item) => item.context),
      ]
      const runsPending = (await runsForHead(entry.head)).some((run) => run.status !== "completed")
      // A head that has registered no check yet is not settled: the workflows it will start are still
      // being dispatched, and an empty set would pass `every` vacuously (Pullfrog on PR 1091).
      const quiet = completedNames.size > 0 && !pending && !runsPending && requiredChecks.every((name) => completedNames.has(name))
      const observed = [...completedNames].sort().join("\n")
      entry.settled = quiet && lastQuietSet.get(entry.number) === observed
      lastQuietSet.set(entry.number, quiet ? observed : null)
    }
    if (result.pullRequests.every((entry) => entry.settled)) finish("SETTLED", 0)
    if (Date.now() >= deadline) finish("CEILING", 3)
    await wait(Math.min(config.timeouts.pollSeconds * 1000, Math.max(1, deadline - Date.now())))
  }
} catch (error) {
  finish("READ_ERROR", 1, error.message)
}
