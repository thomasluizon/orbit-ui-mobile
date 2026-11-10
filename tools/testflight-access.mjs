#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { appStoreToken } from "./lib/app-store-connect-token.mjs"

const USAGE = `usage: testflight-access.mjs --app-id <apple id> --version <x.y.z> --build <number> [--timeout-minutes <n>]
Runs after the iOS Release upload. Waits until App Store Connect shows the uploaded build as VALID, then
makes sure the app has an internal beta group with access to all builds and links to it every tester of the
team's other internal beta groups. The group is created only when missing. A tester is never created.
Writes the result to $GITHUB_STEP_SUMMARY when set. Reads APP_STORE_CONNECT_API_KEY_ID,
APP_STORE_CONNECT_API_ISSUER_ID and APP_STORE_CONNECT_API_PRIVATE_KEY from the environment.
Never prints a tester e-mail or name.
--help, -h print usage
exit codes: 0 build valid and the group has a tester; 1 invalid build, timeout or API failure; 2 invalid arguments`

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

const findInternalGroup = async (client, appId) => {
  const groups = await client.getAll(`/v1/apps/${appId}/betaGroups`, { limit: String(PAGE_LIMIT) })
  const existing = groups.find(({ attributes }) => attributes?.isInternalGroup === true && attributes?.hasAccessToAllBuilds === true)
  return existing ? { id: existing.id, name: existing.attributes.name } : null
}

const createInternalGroup = async (client, appId) => {
  const created = await client.post("/v1/betaGroups", { data: {
    type: "betaGroups", attributes: { name: GROUP_NAME, isInternalGroup: true, hasAccessToAllBuilds: true },
    relationships: { app: { data: { type: "apps", id: appId } } },
  } })
  return { id: created.data.id, name: created.data.attributes.name }
}

const testerIdsOf = async (client, groupId) =>
  (await client.getAll(`/v1/betaGroups/${groupId}/betaTesters`, { limit: String(PAGE_LIMIT) })).map(({ id }) => id)

/** The testers of every internal group of the team except one, each id once. */
const internalTesterIds = async (client, excludedGroupId) => {
  const groups = await client.getAll("/v1/betaGroups", { "filter[isInternalGroup]": "true", limit: String(PAGE_LIMIT) })
  const ids = new Set()
  for (const { id } of groups) {
    if (id === excludedGroupId) continue
    for (const testerId of await testerIdsOf(client, id)) ids.add(testerId)
  }
  return ids
}

/**
 * Gives the app an all-builds internal group and links to it every tester of the team's other internal groups.
 * A tester is never created and no e-mail address is read or sent. The run fails before any write when the
 * group would end with no tester, because then nobody could install the build.
 */
export const ensureInternalTesterAccess = async ({ client, appId }) => {
  const existing = await findInternalGroup(client, appId)
  const members = new Set(existing ? await testerIdsOf(client, existing.id) : [])
  const missing = [...await internalTesterIds(client, existing?.id)].filter((id) => !members.has(id))
  const testerCount = members.size + missing.length
  if (testerCount === 0) throw new Error("No internal tester found in any internal beta group of the team, so nobody could install the build")
  const group = existing ?? await createInternalGroup(client, appId)
  if (missing.length > 0) {
    await client.post(`/v1/betaGroups/${group.id}/relationships/betaTesters`, { data: missing.map((id) => ({ type: "betaTesters", id })) })
  }
  return { groupName: group.name, createdGroup: !existing, linkedTesters: missing.length, testerCount }
}

export const summaryLines = ({ version, buildNumber, processingState, groupName, createdGroup, linkedTesters, testerCount }) => [
  "## TestFlight access",
  `- Build ${version} (${buildNumber}) processing state: ${processingState}`,
  `- Internal group: ${groupName}${createdGroup ? " (created by this run)" : ""}`,
  `- Testers in the group: ${testerCount}`,
  `- Testers linked by this run: ${linkedTesters}`,
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
