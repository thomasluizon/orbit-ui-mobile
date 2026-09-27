#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const USAGE = `usage: release-plan.mjs [--environment production|staging]

Read GitHub release records and list commits not yet deployed for each service.
The default environment is production. Staging compares redesign/main with staging records.
--help, -h  print this usage and exit 0
exit codes: 0 plan produced; 1 GitHub read or response error; 2 invalid arguments`

const OWNER = "thomasluizon"
const SERVICES = [
  { name: "api", repo: "orbit-api", workflow: "deploy-api.yml" },
  { name: "web", repo: "orbit-ui-mobile", workflow: "deploy-web.yml" },
  { name: "landing", repo: "orbit-landing-page", workflow: "deploy-landing.yml" },
  { name: "android", repo: "orbit-ui-mobile", workflow: "android-release.yml" },
]
const SHA = /^[a-f0-9]{40}$/

export const githubClient = {
  read(path) {
    return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", timeout: 30_000 }))
  },
}

const expectArray = (value, path) => {
  if (!Array.isArray(value)) throw new Error(`GitHub returned an unexpected array at ${path}`)
  return value
}

async function lastSuccessfulDeployment(client, service, environment) {
  const repo = `${OWNER}/${service.repo}`
  for (let page = 1; ; page++) {
    const path = `repos/${repo}/deployments?environment=${environment}&per_page=100&page=${page}`
    const deployments = expectArray(await client.read(path), path)
    for (const deployment of deployments) {
      if (deployment.environment !== environment) continue
      if (deployment.task !== "deploy") continue
      if (!Number.isInteger(deployment.id) || !SHA.test(deployment.sha)) {
        throw new Error(`GitHub deployment at ${path} has an unexpected shape`)
      }
      const statusPath = `repos/${repo}/deployments/${deployment.id}/statuses?per_page=100`
      const statuses = expectArray(await client.read(statusPath), statusPath)
      if (statuses.some((status) => typeof status?.state !== "string")) {
        throw new Error(`GitHub deployment status at ${statusPath} has an unexpected shape`)
      }
      if (statuses.some((status) => status.state === "success")) return deployment.sha
    }
    if (deployments.length < 100) return null
  }
}

async function previousAndroidRun(client, environment) {
  const branch = environment === "production" ? "main" : "redesign/main"
  for (let page = 1; ; page++) {
    const path = `repos/${OWNER}/orbit-ui-mobile/actions/workflows/android-release.yml/runs?branch=${encodeURIComponent(branch)}&per_page=100&page=${page}`
    const response = await client.read(path)
    const runs = expectArray(response?.workflow_runs, path)
    for (const run of runs) {
      const title = /^Android Release \S+ \(\d+\) to (internal|closed|open|production) on /.exec(run.display_title)
      if (run.conclusion === "success" && run.status === "completed" && run.head_branch === branch &&
          title && (environment === "production" ? ["open", "production"] : ["internal", "closed"]).includes(title[1])) {
        if (!SHA.test(run.head_sha)) throw new Error(`GitHub workflow run at ${path} has an unexpected SHA`)
        return run.head_sha
      }
    }
    if (runs.length < 100) return null
  }
}

async function planService(client, service, environment) {
  const branch = environment === "production" ? "main" : "redesign/main"
  const repo = `${OWNER}/${service.repo}`
  const headPath = `repos/${repo}/commits/${encodeURIComponent(branch)}`
  const head = await client.read(headPath)
  if (!SHA.test(head?.sha) || typeof head.commit?.message !== "string") {
    throw new Error(`GitHub commit at ${headPath} has an unexpected shape`)
  }
  const deployedSha = service.name === "android"
    ? await previousAndroidRun(client, environment)
    : await lastSuccessfulDeployment(client, service, environment)
  if (deployedSha === head.sha) return { ...service, branch, headSha: head.sha, deployedSha, commits: [], needsRelease: false }
  if (deployedSha === null) {
    return { ...service, branch, headSha: head.sha, deployedSha: null,
      commits: [{ sha: head.sha, message: head.commit.message.split("\n")[0] }],
      needsRelease: true, noBaseline: true }
  }
  const path = `repos/${repo}/compare/${deployedSha}...${head.sha}`
  const comparison = await client.read(path)
  if (!Number.isInteger(comparison?.ahead_by) || !Number.isInteger(comparison.behind_by) ||
      !Number.isInteger(comparison.total_commits) || !Array.isArray(comparison.commits)) {
    throw new Error(`GitHub comparison at ${path} has an unexpected shape`)
  }
  if (comparison.behind_by !== 0 || comparison.commits.length !== comparison.total_commits) {
    throw new Error(`GitHub comparison at ${path} diverged or omitted commits`)
  }
  const commits = comparison.commits.map((commit) => {
    if (!SHA.test(commit?.sha) || typeof commit.commit?.message !== "string") {
      throw new Error(`GitHub comparison at ${path} contains an unexpected commit`)
    }
    return { sha: commit.sha, message: commit.commit.message.split("\n")[0] }
  })
  return { ...service, branch, headSha: head.sha, deployedSha, commits, needsRelease: commits.length > 0 }
}

export async function planRelease(client = githubClient, environment = "production") {
  if (!["production", "staging"].includes(environment)) throw new Error("invalid environment")
  const services = environment === "staging" ? SERVICES.filter((service) => service.name !== "landing") : SERVICES
  return { environment, services: await Promise.all(services.map((service) => planService(client, service, environment))) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE)
  } else if (args.length > 2 || args.length === 1 || args[0] !== "--environment" ||
             !["production", "staging"].includes(args[1])) {
    if (args.length === 0) {
      try { console.log(JSON.stringify(await planRelease())) } catch (error) { console.error(error.message); process.exitCode = 1 }
    } else { console.error(USAGE); process.exitCode = 2 }
  } else {
    try { console.log(JSON.stringify(await planRelease(githubClient, args[1]))) }
    catch (error) { console.error(error.message); process.exitCode = 1 }
  }
}
