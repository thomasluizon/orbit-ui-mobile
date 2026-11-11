#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { apiClient } from "./lib/app-store-connect.mjs"
import { appStoreToken } from "./lib/app-store-connect-token.mjs"

const USAGE = `usage: testflight-access.mjs --app-id <apple id> --version <x.y.z> --build <number> [--timeout-minutes <n>]
Runs after the iOS Release upload. Waits until App Store Connect shows the uploaded build as VALID, then
makes sure the app has an internal beta group with access to all builds and that the group holds every person
of the team's other internal beta groups. A tester record belongs to one app, so a missing person is created
in this app's group with the e-mail address and name read from Apple. The group is created only when missing.
No new person is invented. Writes the result to $GITHUB_STEP_SUMMARY when set. Reads
APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID and APP_STORE_CONNECT_API_PRIVATE_KEY from
the environment. Never prints a tester e-mail or name.
--help, -h print usage
exit codes: 0 build valid and the group has a tester; 1 invalid build, timeout or API failure; 2 invalid arguments`

const DEFAULT_TIMEOUT_MINUTES = 25
const POLL_INTERVAL_MS = 30_000
const PAGE_LIMIT = 200
const GROUP_NAME = "Orbit internal"

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
    if (state === "VALID") return
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

const testersOf = (client, groupId) => client.getAll(`/v1/betaGroups/${groupId}/betaTesters`, { limit: String(PAGE_LIMIT) })

const addressOf = ({ attributes }) => (typeof attributes?.email === "string" ? attributes.email.trim().toLowerCase() : "")

/** The people of every internal group of the team except one, each person once, keyed by lower-case e-mail address. */
const internalPeople = async (client, excludedGroupId) => {
  const groups = await client.getAll("/v1/betaGroups", { "filter[isInternalGroup]": "true", limit: String(PAGE_LIMIT) })
  const people = new Map()
  for (const { id } of groups) {
    if (id === excludedGroupId) continue
    for (const testerRecord of await testersOf(client, id)) {
      const address = addressOf(testerRecord)
      if (address && !people.has(address)) people.set(address, testerRecord.attributes)
    }
  }
  return people
}

const createTester = (client, groupId, { email, firstName, lastName }) =>
  client.post("/v1/betaTesters", { data: {
    type: "betaTesters",
    attributes: { email, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) },
    relationships: { betaGroups: { data: [{ type: "betaGroups", id: groupId }] } },
  } })

/**
 * Gives the app an all-builds internal group that holds every person of the team's other internal groups.
 * A tester record belongs to one app, so a person is matched by lower-case e-mail address, never by tester
 * id, and a missing person gets a new record in this app's group. The address and name go only back to Apple.
 * The run fails before any write when the group would end with no tester.
 */
export const ensureInternalTesterAccess = async ({ client, appId }) => {
  const existing = await findInternalGroup(client, appId)
  const members = new Set((existing ? await testersOf(client, existing.id) : []).map(addressOf).filter(Boolean))
  const missing = [...await internalPeople(client, existing?.id)].filter(([address]) => !members.has(address))
  const testerCount = members.size + missing.length
  if (testerCount === 0) throw new Error("No internal tester found in any internal beta group of the team, so nobody could install the build")
  const group = existing ?? await createInternalGroup(client, appId)
  for (const [, attributes] of missing) await createTester(client, group.id, attributes)
  return { groupName: group.name, createdGroup: !existing, addedTesters: missing.length, testerCount }
}

export const summaryLines = ({ version, buildNumber, groupName, createdGroup, addedTesters, testerCount }) => [
  "## TestFlight access",
  `- Build ${version} (${buildNumber}) processing state: VALID`,
  `- Internal group: ${groupName}${createdGroup ? " (created by this run)" : ""}`,
  `- Testers in the group: ${testerCount}`,
  `- Testers added by this run: ${addedTesters}`,
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
    await waitForProcessedBuild({
      client, ...options, sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    })
    const access = await ensureInternalTesterAccess({ client, appId: options.appId })
    const lines = summaryLines({ version: options.version, buildNumber: options.buildNumber, ...access })
    console.log(lines.join("\n"))
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`)
  } catch (error) { console.error(error.message); process.exit(1) }
}
