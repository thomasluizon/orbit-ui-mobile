#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { setTimeout as wait } from "node:timers/promises"
import { REPO_ROOT, clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-release.mjs --repo api|ui|landing --run <id> --sha <commit> [--ceiling-minutes <n>] [--poll-seconds <n>]

Watch one dispatched GitHub Actions release run through completion. Registers a harness wake source.
An environment approval remains pending, with its run link printed while waiting.
--help, -h  print this usage and exit 0
exit codes: 0 successful run; 1 failed run or GitHub read; 2 invalid arguments;
            3 ceiling reached; 130 SIGINT; 143 SIGTERM`
const REPOS = { api: "orbit-api", ui: "orbit-ui-mobile", landing: "orbit-landing-page" }
const SHA = /^[a-f0-9]{40}$/

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const args = process.argv.slice(2)
const values = {}
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index]
  const value = args[index + 1]
  if (!["--repo", "--run", "--sha", "--ceiling-minutes", "--poll-seconds"].includes(flag) ||
      !value || value.startsWith("--") || flag in values) {
    console.error(USAGE)
    process.exit(2)
  }
  values[flag] = value
}
const repo = REPOS[values["--repo"]]
const runId = Number(values["--run"])
const sha = values["--sha"]
const ceilingMinutes = Number(values["--ceiling-minutes"] ?? 360)
const pollSeconds = Number(values["--poll-seconds"] ?? 30)
if (!repo || !Number.isSafeInteger(runId) || runId <= 0 || !SHA.test(sha ?? "") ||
    !Number.isFinite(ceilingMinutes) || ceilingMinutes <= 0 ||
    !Number.isFinite(pollSeconds) || pollSeconds <= 0) {
  console.error(USAGE)
  process.exit(2)
}

let finished = false
const result = { repo: values["--repo"], runId, sha, url: `https://github.com/thomasluizon/${repo}/actions/runs/${runId}`, status: null, conclusion: null, reason: null }
const finish = (reason, code, error) => {
  if (finished) return
  finished = true
  clearWakeSource(process.pid, REPO_ROOT)
  result.reason = reason
  if (error) result.error = error
  console.log(JSON.stringify(result))
  process.exit(code)
}
process.once("exit", () => clearWakeSource(process.pid, REPO_ROOT))
process.once("SIGINT", () => finish("SIGINT", 130))
process.once("SIGTERM", () => finish("SIGTERM", 143))
if (!registerWakeSource({ pid: process.pid, what: `Release ${values["--repo"]} run ${runId}`, startedAt: new Date().toISOString() }, REPO_ROOT)) {
  finish("WAKE_REGISTRATION_FAILED", 1)
}

const deadline = Date.now() + ceilingMinutes * 60_000
let announcedApproval = false
try {
  while (!finished) {
    const path = `repos/thomasluizon/${repo}/actions/runs/${runId}`
    const run = JSON.parse(execFileSync(process.env.GH_BIN || "gh", ["api", path], { encoding: "utf8", timeout: 30_000 }))
    if (run?.id !== runId || run.head_sha !== sha || typeof run.html_url !== "string" ||
        typeof run.status !== "string" || !(run.conclusion === null || typeof run.conclusion === "string")) {
      throw new Error(`GitHub workflow run ${runId} had an unexpected identity or shape`)
    }
    result.url = run.html_url
    result.status = run.status
    result.conclusion = run.conclusion
    if (run.status === "completed") finish(run.conclusion === "success" ? "SUCCESS" : "FAILED", run.conclusion === "success" ? 0 : 1)
    if (run.status === "waiting" && !announcedApproval) {
      console.error(`Run awaits environment approval: ${run.html_url}`)
      announcedApproval = true
    }
    if (Date.now() >= deadline) finish("CEILING", 3)
    await wait(Math.min(pollSeconds * 1000, Math.max(1, deadline - Date.now())))
  }
} catch (error) {
  finish("READ_ERROR", 1, error.message)
}
