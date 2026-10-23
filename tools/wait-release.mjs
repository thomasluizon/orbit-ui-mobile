#!/usr/bin/env node
import { setTimeout as wait } from "node:timers/promises"
import { readGithub } from "./lib/github-read.mjs"
import { redactSecrets } from "./lib/github-auth.mjs"
import { REPO_ROOT, clearWakeSource, registerWakeSource } from "./lib/run-state.mjs"

const USAGE = `usage: wait-release.mjs --repo api|ui|landing --run <id> --sha <planned-commit> [--workflow-sha <dispatch-commit>] [--service-url <origin>] [--workflow release|android] [--ceiling-minutes <n>] [--poll-seconds <n>]

Watch one dispatched GitHub Actions release run through completion. Registers a harness wake source.
--sha is the planned deployed commit. --workflow-sha identifies the workflow dispatch ref (defaults to --sha).
Releases require --service-url, the selected service origin: verifies web/API health or landing orbit-build.
--workflow android is UI-only and checks the workflow commit without a web service check.
The run link is included in every result.
Transient GitHub errors retry until the ceiling; JSON includes their count and last text.
--help, -h  print this usage and exit 0
exit codes: 0 successful run and deployed commit; 1 failed run, remote read, or deployed commit mismatch; 2 invalid arguments;
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
  if (!["--repo", "--run", "--sha", "--workflow-sha", "--service-url", "--workflow", "--ceiling-minutes", "--poll-seconds"].includes(flag) ||
      !value || value.startsWith("--") || flag in values) {
    console.error(USAGE)
    process.exit(2)
  }
  values[flag] = value
}
const repo = REPOS[values["--repo"]]
const runId = Number(values["--run"])
const sha = values["--sha"]
const workflowSha = values["--workflow-sha"] ?? sha
const workflow = values["--workflow"] ?? "release"
const serviceUrl = values["--service-url"]
const validOrigin = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
  } catch { return false }
}
const ceilingMinutes = Number(values["--ceiling-minutes"] ?? 360)
const pollSeconds = Number(values["--poll-seconds"] ?? 30)
if (!repo || !["release", "android"].includes(workflow) ||
    (workflow === "release" ? !validOrigin(serviceUrl) : values["--repo"] !== "ui" || serviceUrl !== undefined || workflowSha !== sha) ||
    !SHA.test(workflowSha ?? "") || !Number.isSafeInteger(runId) || runId <= 0 || !SHA.test(sha ?? "") ||
    !Number.isFinite(ceilingMinutes) || ceilingMinutes <= 0 ||
    !Number.isFinite(pollSeconds) || pollSeconds <= 0) {
  console.error(USAGE)
  process.exit(2)
}

let finished = false
const result = { repo: values["--repo"], runId, sha, workflowSha, deployedSha: null, url: `https://github.com/thomasluizon/${repo}/actions/runs/${runId}`, status: null, conclusion: null, reason: null, transientErrors: { count: 0, last: null } }
const finish = (reason, code, error) => {
  if (finished) return
  finished = true
  clearWakeSource(process.pid, REPO_ROOT)
  result.reason = reason
  if (error) result.error = redactSecrets(error, [process.env.GH_TOKEN, process.env.GITHUB_TOKEN])
  console.log(JSON.stringify(result))
  process.exit(code)
}
process.once("exit", () => clearWakeSource(process.pid, REPO_ROOT))
process.once("SIGINT", () => finish("SIGINT", 130))
process.once("SIGTERM", () => finish("SIGTERM", 143))
if (!registerWakeSource({ pid: process.pid, what: `Release ${values["--repo"]} run ${runId}`, startedAt: new Date().toISOString() }, REPO_ROOT)) {
  finish("WAKE_REGISTRATION_FAILED", 1)
}

const verifyDeployedCommit = async () => {
  if (workflow === "android") return
  const endpoint = values["--repo"] === "ui" ? "/api/health" : values["--repo"] === "api" ? "/health" : "/"
  const response = await fetch(new URL(endpoint, serviceUrl), { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Service verification returned HTTP ${response.status}`)
  let commit
  if (values["--repo"] === "landing") {
    const html = await response.text()
    commit = html.match(/<meta name="orbit-build" content="([0-9a-f]{40})"/)?.[1]
  } else {
    const health = await response.json()
    const expectedStatus = values["--repo"] === "ui" ? "ok" : "Healthy"
    if (health.status !== expectedStatus) throw new Error(`Service health did not report ${expectedStatus}`)
    commit = health.commit
  }
  result.deployedSha = commit ?? null
  if (commit !== sha) throw new Error(`Service serves ${commit ?? "no commit"}, expected planned SHA ${sha}`)
}

const deadline = Date.now() + ceilingMinutes * 60_000
try {
  while (!finished) {
    const path = `repos/thomasluizon/${repo}/actions/runs/${runId}`
    const run = await readGithub(path, process.env, { deadline, pollMs: pollSeconds * 1000, onTransientError: (text) => {
      result.transientErrors.count++
      result.transientErrors.last = redactSecrets(text, [process.env.GH_TOKEN, process.env.GITHUB_TOKEN])
    } })
    if (run?.id !== runId || run.head_sha !== workflowSha || typeof run.html_url !== "string" ||
        typeof run.status !== "string" || !(run.conclusion === null || typeof run.conclusion === "string")) {
      throw new Error(`GitHub workflow run ${runId} had an unexpected identity or shape`)
    }
    result.url = run.html_url
    result.status = run.status
    result.conclusion = run.conclusion
    if (run.status === "completed") {
      if (run.conclusion !== "success") finish("FAILED", 1)
      await verifyDeployedCommit()
      finish("SUCCESS", 0)
    }
    if (Date.now() >= deadline) finish("CEILING", 3)
    await wait(Math.min(pollSeconds * 1000, Math.max(1, deadline - Date.now())))
  }
} catch (error) {
  if (error.code === "GITHUB_READ_CEILING") finish("CEILING", 3)
  finish("READ_ERROR", 1, error.message)
}
