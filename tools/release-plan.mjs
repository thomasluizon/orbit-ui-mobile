#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const USAGE = `usage: release-plan.mjs [--environment production|staging] [--branch <name>] [--track internal|open|production]

List commits not yet released to production or staging. Staging reads live Render state.
The default environment is production. The default Android track is open for production
and internal for staging. Staging requires --branch. Set RENDER_MCP_TOKEN for Render reads.
--help, -h  print this usage and exit 0
exit codes: 0 plan produced; 1 remote read or response error; 2 invalid arguments`

const OWNER = "thomasluizon"
const SERVICES = [
  { name: "api", repo: "orbit-api", workflow: "release.yml" },
  { name: "web", repo: "orbit-ui-mobile", workflow: "release.yml" },
  { name: "landing", repo: "orbit-landing-page", workflow: "release.yml" },
  { name: "android", repo: "orbit-ui-mobile", workflow: "android-release.yml" },
]
const SHA = /^[a-f0-9]{40}$/

export const githubClient = {
  read(path) {
    const projection = path.includes("/actions/variables?")
          ? "{total_count,variables:[.variables[] | {name,value}]}"
        : path.includes("/actions/workflows/")
          ? "{workflow_runs:[.workflow_runs[] | {display_title,conclusion,status,head_branch,head_sha}]}"
          : path.includes("/compare/")
            ? "{ahead_by,behind_by,total_commits,commits:[.commits[] | {sha,commit:{message:.commit.message}}]}"
            : "{sha,commit:{message:.commit.message}}"
    return JSON.parse(execFileSync("gh", ["api", path, "--jq", projection],
      { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }))
  },
  async readRender(path) {
    if (!process.env.RENDER_MCP_TOKEN) throw new Error("RENDER_MCP_TOKEN is required for Render reads")
    const response = await fetch(`https://api.render.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${process.env.RENDER_MCP_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Render ${path} returned HTTP ${response.status}`)
    return response.json()
  },
  async readHealth(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Web health returned HTTP ${response.status}`)
    return response.json()
  },
}

const serviceVariable = (client, repo, name) => {
  const path = `repos/${OWNER}/${repo}/actions/variables?per_page=100`
  const variables = client.read(path)
  if (!Number.isInteger(variables?.total_count) || !Array.isArray(variables.variables) ||
      variables.total_count !== variables.variables.length ||
      variables.variables.some((variable) => typeof variable?.name !== "string" || typeof variable.value !== "string")) {
    throw new Error(`GitHub variables at ${path} have an unexpected shape or need pagination`)
  }
  return variables.variables.find((variable) => variable.name === name)?.value ?? null
}

export const stagingServiceIds = (client = githubClient) => ({
  api: serviceVariable(client, "orbit-ui-mobile", "RENDER_API_STAGING_SERVICE_ID"),
  web: serviceVariable(client, "orbit-ui-mobile", "RENDER_WEB_STAGING_SERVICE_ID"),
})

export const productionServiceIds = (client = githubClient) => ({
  api: serviceVariable(client, "orbit-api", "RENDER_PRODUCTION_SERVICE_ID"),
  web: serviceVariable(client, "orbit-ui-mobile", "RENDER_WEB_SERVICE_ID"),
})

const expectArray = (value, path) => {
  if (!Array.isArray(value)) throw new Error(`GitHub returned an unexpected array at ${path}`)
  return value
}

async function landingServiceId(client, environment) {
  const path = "services?limit=100"
  const records = expectArray(await client.readRender(path), path)
  if (records.length === 100) throw new Error("Render service list needs pagination")
  const name = environment === "production" ? "orbit-landing" : "orbit-landing-staging"
  const matches = records.filter((record) => record?.service?.name === name)
  if (matches.length > 1) throw new Error(`Multiple Render services named ${name}`)
  if (matches.length === 0) return null
  const id = matches[0].service.id
  if (typeof id !== "string" || !/^srv-[a-z0-9]+$/.test(id)) {
    throw new Error(`Render service named ${name} has an unexpected ID`)
  }
  return id
}

async function previousAndroidRun(client, branch, track) {
  for (let page = 1; ; page++) {
    const path = `repos/${OWNER}/orbit-ui-mobile/actions/workflows/android-release.yml/runs?branch=${encodeURIComponent(branch)}&per_page=100&page=${page}`
    const response = await client.read(path)
    const runs = expectArray(response?.workflow_runs, path)
    for (const run of runs) {
      const title = /^Android Release \S+ \(\d+\) to (internal|open|production) on /.exec(run.display_title)
      if (run.conclusion === "success" && run.status === "completed" && run.head_branch === branch &&
          title?.[1] === track) {
        if (!SHA.test(run.head_sha)) throw new Error(`GitHub workflow run at ${path} has an unexpected SHA`)
        return run.head_sha
      }
    }
    if (runs.length < 100) return null
  }
}

async function renderBaseline(client, service, serviceIds, environment) {
  const id = service.name === "landing" ? await landingServiceId(client, environment) : serviceIds[service.name]
  if (typeof id !== "string" || !/^srv-[a-z0-9]+$/.test(id)) {
    if (id == null) return null
    throw new Error(`invalid Render service ID for ${service.name}`)
  }
  if (service.name === "api" || service.name === "landing") {
    const path = `services/${id}/deploys?status=live&limit=1`
    const deploys = expectArray(await client.readRender(path), path)
    if (deploys.length === 0) return null
    const commit = deploys[0]?.deploy?.commit?.id
    if (!SHA.test(commit)) throw new Error(`Render deploy at ${path} has an unexpected commit`)
    return commit
  }
  const path = `services/${id}`
  const serviceRecord = await client.readRender(path)
  const origin = serviceRecord?.serviceDetails?.url
  if (typeof origin !== "string" || !/^https:\/\/[^/]+\/?$/.test(origin)) {
    throw new Error(`Render service at ${path} has an unexpected URL`)
  }
  const health = await client.readHealth(`${origin.replace(/\/$/, "")}/api/health`)
  if (health?.status !== "ok" || !SHA.test(health.commit)) {
    throw new Error(`Web health at ${origin} has an unexpected response`)
  }
  return health.commit
}

async function planService(client, service, environment, branch, serviceIds, track) {
  const repo = `${OWNER}/${service.repo}`
  const headPath = `repos/${repo}/commits/${encodeURIComponent(branch)}`
  const head = await client.read(headPath)
  if (!SHA.test(head?.sha) || typeof head.commit?.message !== "string") {
    throw new Error(`GitHub commit at ${headPath} has an unexpected shape`)
  }
  const deployedSha = service.name === "android"
    ? await previousAndroidRun(client, branch, track)
    : await renderBaseline(client, service, serviceIds, environment)
  const plannedService = service.name === "android" ? { ...service, track } : service
  if (deployedSha === head.sha) return { ...plannedService, branch, headSha: head.sha, deployedSha, commits: [], needsRelease: false }
  if (deployedSha === null) {
    return { ...plannedService, branch, headSha: head.sha, deployedSha: null,
      commits: [{ sha: head.sha, message: head.commit.message.split("\n")[0] }],
      needsRelease: true, noBaseline: true }
  }
  const path = `repos/${repo}/compare/${deployedSha}...${head.sha}`
  const comparison = await client.read(path)
  if (!Number.isInteger(comparison?.ahead_by) || !Number.isInteger(comparison.behind_by) ||
      !Number.isInteger(comparison.total_commits) || !Array.isArray(comparison.commits)) {
    throw new Error(`GitHub comparison at ${path} has an unexpected shape`)
  }
  if (comparison.commits.length !== comparison.total_commits ||
      environment === "production" && comparison.behind_by !== 0) {
    throw new Error(`GitHub comparison at ${path} diverged or omitted commits`)
  }
  const commits = comparison.commits.map((commit) => {
    if (!SHA.test(commit?.sha) || typeof commit.commit?.message !== "string") {
      throw new Error(`GitHub comparison at ${path} contains an unexpected commit`)
    }
    return { sha: commit.sha, message: commit.commit.message.split("\n")[0] }
  })
  return { ...plannedService, branch, headSha: head.sha, deployedSha, commits,
    needsRelease: commits.length > 0 || comparison.behind_by > 0,
    ...(comparison.behind_by > 0 ? { deployedFromOtherBranch: true } : {}) }
}

export async function planRelease(client = githubClient, environment = "production", serviceIds = {},
                                  track = environment === "production" ? "open" : "internal", branch = environment === "production" ? "main" : null) {
  if (!["production", "staging"].includes(environment)) throw new Error("invalid environment")
  if (!(environment === "production" ? ["open", "production"] : ["internal"]).includes(track)) {
    throw new Error("invalid Android track for environment")
  }
  if ((environment === "production" && branch !== "main") ||
      (environment === "staging" && (!branch || !/^(?!-)[A-Za-z0-9._/-]+$/.test(branch)))) {
    throw new Error("invalid branch for environment")
  }
  const planned = await Promise.all(SERVICES.map((service) => planService(client, service, environment, branch, serviceIds, track)))
  return { environment, branch, services: planned }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE)
  } else {
    const options = { environment: "production", track: null, branch: null }
    let invalid = false
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index]
      const value = args[index + 1]
      if (flag === "--environment" && !args.slice(0, index).includes(flag) && ["production", "staging"].includes(value)) {
        options.environment = value
      } else if (flag === "--branch" && !args.slice(0, index).includes(flag) && value && !value.startsWith("--")) {
        options.branch = value
      } else if (flag === "--track" && !args.slice(0, index).includes(flag) &&
                 ["internal", "open", "production"].includes(value)) {
        options.track = value
      } else { invalid = true; break }
    }
    if (invalid || options.environment === "staging" && !options.branch || options.environment === "production" && options.branch && options.branch !== "main" ||
        options.track && !(options.environment === "production" ? ["open", "production"] : ["internal"]).includes(options.track)) {
      console.error(USAGE)
      process.exitCode = 2
    } else {
      try {
        const serviceIds = options.environment === "staging" ? stagingServiceIds() : productionServiceIds()
        console.log(JSON.stringify(await planRelease(githubClient, options.environment, serviceIds,
          options.track ?? (options.environment === "production" ? "open" : "internal"), options.branch ?? "main")))
      } catch (error) { console.error(error.message); process.exitCode = 1 }
    }
  }
}
