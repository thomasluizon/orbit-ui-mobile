#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { appStoreToken } from "./lib/app-store-connect-token.mjs"

const USAGE = `usage: testflight-access.mjs --app-id <apple id> --version <x.y.z> --build <number> [--timeout-minutes <n>]
Runs after the iOS Release upload. Waits until App Store Connect shows the uploaded build as VALID, then
makes sure an internal beta group with access to all builds holds the account holder of the team as a tester.
The group and the tester are created only when missing. Writes the result to $GITHUB_STEP_SUMMARY when set.
Reads APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID and APP_STORE_CONNECT_API_PRIVATE_KEY
from the environment. Never prints the tester identity.
--help, -h print usage
exit codes: 0 build valid and tester has access; 1 invalid build, timeout or API failure; 2 invalid arguments`

const API_ORIGIN = "https://api.appstoreconnect.apple.com"
const DEFAULT_TIMEOUT_MINUTES = 25
const POLL_INTERVAL_MS = 30_000
const PAGE_LIMIT = 200
const GROUP_NAME = "Orbit internal"

/** App Store Connect API client: a fresh bearer token per request (each lives 10 minutes), GET with pagination, and JSON POST. */
export const apiClient = (createToken, request = fetch) => {
  const send = async (url, options) => {
    const response = await request(url, {
      ...options,
      headers: { Authorization: `Bearer ${createToken()}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`App Store Connect ${options.method} ${new URL(url).pathname} failed (HTTP ${response.status})`)
    return response
  }
  const getAll = async (path, query = {}) => {
    const first = new URL(path, API_ORIGIN)
    for (const [key, value] of Object.entries(query)) first.searchParams.set(key, value)
    const visited = new Set()
    const resources = []
    for (let next = first; next; ) {
      if (next.origin !== API_ORIGIN || next.pathname !== first.pathname || visited.has(next.href)) throw new Error("Invalid App Store Connect pagination link")
      visited.add(next.href)
      const page = await (await send(next, { method: "GET" })).json()
      if (!Array.isArray(page.data)) throw new Error(`Invalid App Store Connect response for ${first.pathname}`)
      resources.push(...page.data)
      next = page.links?.next ? new URL(page.links.next, API_ORIGIN) : null
    }
    return resources
  }
  const post = async (path, body) => {
    const response = await send(new URL(path, API_ORIGIN), { method: "POST", body: JSON.stringify(body) })
    return response.status === 204 ? null : response.json()
  }
  return { getAll, post }
}

/**
 * Polls until the uploaded build is VALID. FAILED and INVALID end the run at once; an absent build is
 * retried because the record appears some time after the upload.
 */
export const waitForProcessedBuild = async ({ client, appId, version, buildNumber, timeoutMs, intervalMs = POLL_INTERVAL_MS, sleep, now = Date.now }) => {
  const deadline = now() + timeoutMs
  for (;;) {
    const builds = await client.getAll("/v1/builds", {
      "filter[app]": appId, "filter[preReleaseVersion.version]": version, "filter[version]": buildNumber,
      "filter[preReleaseVersion.platform]": "IOS", limit: "1",
    })
    const state = builds[0]?.attributes?.processingState
    if (state === "VALID") return { buildId: builds[0].id, processingState: state }
    if (state === "FAILED" || state === "INVALID") throw new Error(`Build ${version} (${buildNumber}) processing ended as ${state}`)
    if (now() + intervalMs > deadline) throw new Error(`Build ${version} (${buildNumber}) was not VALID before the timeout (last state: ${state ?? "not listed"})`)
    await sleep(intervalMs)
  }
}

const accountHolderEmail = async (client) => {
  const holders = await client.getAll("/v1/users", { "filter[roles]": "ACCOUNT_HOLDER", limit: String(PAGE_LIMIT) })
  const email = holders.length === 1 ? holders[0].attributes?.username : null
  if (!email) throw new Error(`Expected exactly one ACCOUNT_HOLDER user, found ${holders.length}`)
  return email
}

const internalGroup = async (client, appId) => {
  const groups = await client.getAll(`/v1/apps/${appId}/betaGroups`, { limit: String(PAGE_LIMIT) })
  const existing = groups.find(({ attributes }) => attributes?.isInternalGroup === true && attributes?.hasAccessToAllBuilds === true)
  if (existing) return { id: existing.id, name: existing.attributes.name, created: false }
  const created = await client.post("/v1/betaGroups", { data: {
    type: "betaGroups", attributes: { name: GROUP_NAME, isInternalGroup: true, hasAccessToAllBuilds: true },
    relationships: { app: { data: { type: "apps", id: appId } } },
  } })
  return { id: created.data.id, name: created.data.attributes.name, created: true }
}

/** Makes the account holder an internal tester of an all-builds group, creating only what is missing. */
export const ensureInternalTesterAccess = async ({ client, appId }) => {
  const email = await accountHolderEmail(client)
  const group = await internalGroup(client, appId)
  const sameEmail = (tester) => tester.attributes?.email?.toLowerCase() === email.toLowerCase()
  const members = await client.getAll(`/v1/betaGroups/${group.id}/betaTesters`, { limit: String(PAGE_LIMIT) })
  let testerCount = members.length
  let addedTester = false
  if (!members.some(sameEmail)) {
    const known = (await client.getAll("/v1/betaTesters", { "filter[email]": email, limit: "1" })).find(sameEmail)
    if (known) {
      await client.post(`/v1/betaGroups/${group.id}/relationships/betaTesters`, { data: [{ type: "betaTesters", id: known.id }] })
    } else {
      await client.post("/v1/betaTesters", { data: {
        type: "betaTesters", attributes: { email },
        relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } },
      } })
    }
    testerCount += 1
    addedTester = true
  }
  return { groupName: group.name, createdGroup: group.created, addedTester, testerCount }
}

export const summaryLines = ({ version, buildNumber, processingState, groupName, createdGroup, addedTester, testerCount }) => [
  "## TestFlight access",
  `- Build ${version} (${buildNumber}) processing state: ${processingState}`,
  `- Internal group: ${groupName}${createdGroup ? " (created by this run)" : ""}`,
  `- Testers in the group: ${testerCount}${addedTester ? " (the account holder was added by this run)" : ""}`,
]

const parseArguments = (args) => {
  const values = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!["--app-id", "--version", "--build", "--timeout-minutes"].includes(key) || args[index + 1] === undefined) return null
    values[key.slice(2)] = args[index + 1]
  }
  const timeoutMinutes = Number(values["timeout-minutes"] ?? DEFAULT_TIMEOUT_MINUTES)
  if (!/^\d+$/.test(values["app-id"] ?? "") || !/^\d+(\.\d+){1,2}$/.test(values.version ?? "") ||
      !/^[1-9]\d*$/.test(values.build ?? "") || !Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return null
  return { appId: values["app-id"], version: values.version, buildNumber: values.build, timeoutMs: timeoutMinutes * 60_000 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
  const options = parseArguments(args)
  if (!options) { console.error(USAGE); process.exit(2) }
  try {
    const credentials = {
      keyId: process.env.APP_STORE_CONNECT_API_KEY_ID, issuerId: process.env.APP_STORE_CONNECT_API_ISSUER_ID,
      privateKey: process.env.APP_STORE_CONNECT_API_PRIVATE_KEY,
    }
    appStoreToken(credentials)
    const client = apiClient(() => appStoreToken(credentials))
    const build = await waitForProcessedBuild({
      client, ...options, sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    })
    const access = await ensureInternalTesterAccess({ client, appId: options.appId })
    const lines = summaryLines({ version: options.version, buildNumber: options.buildNumber, processingState: build.processingState, ...access })
    console.log(lines.join("\n"))
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`)
  } catch (error) { console.error(error.message); process.exit(1) }
}
