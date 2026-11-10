import { readFileSync } from "node:fs"
import { join } from "node:path"
import { apiClient, ensureInternalTesterAccess, summaryLines, waitForProcessedBuild } from "../testflight-access.mjs"
import { REPO_ROOT, T } from "./_harness.mjs"

// Schemas and filters in the fixture are copied from Apple's published OpenAPI specification.
// Every fake response and request body is checked against them. The fixture `pages` key cites each
// documentation page, for example GET /v1/builds:
// https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds
const apple = JSON.parse(readFileSync(new URL("./fixtures/app-store-connect-testflight-schemas.json", import.meta.url), "utf8"))

const resolveSchema = (schema) => (schema?.$ref ? (apple.schemas[schema.$ref.split("/").pop()] ?? {}) : schema)

/** Returns the violations of a JSON value against a schema from the fixture; an unknown reference is not checked. */
const violations = (schema, value, at = "$") => {
  const node = resolveSchema(schema)
  if (!node.type && !node.enum && !node.properties) return []
  if (node.enum && !node.enum.includes(value)) return [`${at}: ${JSON.stringify(value)} is not in the enum`]
  if (node.type === "array") return Array.isArray(value) ? value.flatMap((item, index) => violations(node.items, item, `${at}[${index}]`)) : [`${at}: not an array`]
  if (node.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [`${at}: not an object`]
    const unknown = Object.keys(value).filter((key) => node.properties && !Object.hasOwn(node.properties, key))
    const missing = (node.required ?? []).filter((key) => !Object.hasOwn(value, key))
    return [
      ...unknown.map((key) => `${at}.${key}: not in the schema`), ...missing.map((key) => `${at}.${key}: required`),
      ...Object.entries(node.properties ?? {}).filter(([key]) => Object.hasOwn(value, key)).flatMap(([key, child]) => violations(child, value[key], `${at}.${key}`)),
    ]
  }
  if (node.type === "string" && typeof value !== "string") return [`${at}: not a string`]
  if (node.type === "boolean" && typeof value !== "boolean") return [`${at}: not a boolean`]
  return []
}

const holder = "holder@example.test"
const build = (processingState) => ({ type: "builds", id: "build-1", attributes: { version: "1", processingState } })
const group = (id, name, attributes = {}) => ({ type: "betaGroups", id, attributes: { name, isInternalGroup: true, hasAccessToAllBuilds: true, ...attributes } })
const tester = (id, email) => ({ type: "betaTesters", id, attributes: { email, inviteType: "EMAIL", state: "INSTALLED" } })
const user = (username, roles) => ({ type: "users", id: `user-${username}`, attributes: { username, roles } })

/** A fake App Store Connect that answers only documented paths and records every call. */
const fakeApi = ({ buildStates = ["VALID"], users = [user(holder, ["ACCOUNT_HOLDER"])], groups = [], members = [], knownTesters = [] }) => {
  const calls = []
  const remainingStates = [...buildStates]
  const request = async (url, options) => {
    const address = new URL(url)
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ method: options.method, path: address.pathname, query: Object.fromEntries(address.searchParams), body, headers: options.headers })
    const page = (data, schema) => {
      const response = { data, links: { self: String(url) } }
      const problems = violations({ $ref: schema }, response)
      if (problems.length) throw new Error(`fixture breaks Apple's ${schema} schema: ${problems.join("; ")}`)
      return Response.json(response)
    }
    const route = `${options.method} ${address.pathname}`
    if (route === "GET /v1/builds") {
      const state = remainingStates.length > 1 ? remainingStates.shift() : remainingStates[0]
      return page(state === null ? [] : [build(state)], "#/components/schemas/BuildsResponse")
    }
    if (route === "GET /v1/users") return page(users, "#/components/schemas/UsersResponse")
    if (route === "GET /v1/apps/app-1/betaGroups") return page(groups, "#/components/schemas/BetaGroupsResponse")
    if (route === "POST /v1/betaGroups") {
      const created = group("group-new", body.data.attributes.name)
      groups.push(created)
      return Response.json({ data: created, links: { self: String(url) } }, { status: 201 })
    }
    if (/^GET \/v1\/betaGroups\/[^/]+\/betaTesters$/.test(route)) return page(members, "#/components/schemas/BetaTestersResponse")
    if (route === "GET /v1/betaTesters") return page(knownTesters.filter((entry) => entry.attributes.email === address.searchParams.get("filter[email]")), "#/components/schemas/BetaTestersResponse")
    if (route === "POST /v1/betaTesters") return Response.json({ data: tester("tester-new", body.data.attributes.email), links: { self: String(url) } }, { status: 201 })
    if (/^POST \/v1\/betaGroups\/[^/]+\/relationships\/betaTesters$/.test(route)) return new Response(null, { status: 204 })
    return new Response("{}", { status: 404 })
  }
  return { request, calls }
}

const clientFor = (api) => apiClient(() => "signed-token", api.request)
const noSleep = async () => { throw new Error("a build that is already settled must not sleep") }
const clock = () => {
  let time = 0
  return { now: () => time, sleep: async (milliseconds) => {
    if (time > 3_600_000) throw new Error("the wait never ended")
    time += milliseconds
  } }
}
const processed = (api, overrides = {}) => waitForProcessedBuild({
  client: clientFor(api), appId: "app-1", version: "1.3.152", buildNumber: "1", timeoutMs: 10 * 60_000, intervalMs: 30_000, sleep: noSleep, ...overrides,
})
const rejects = async (promise) => { try { await promise; return null } catch (error) { return error.message } }
const bodiesOf = (api, method, path) => api.calls.filter((call) => call.method === method && call.path === path).map((call) => call.body)

export const cases = async () => {
  T("testflight access: fixture schemas come from Apple's specification", apple.source.includes("developer.apple.com") && Object.keys(apple.pages).length === 8 &&
    Object.values(apple.pages).every((page) => page.startsWith("https://developer.apple.com/documentation/appstoreconnectapi/")) &&
    apple.schemas.Build.properties.attributes.properties.processingState.enum.join() === "PROCESSING,FAILED,INVALID,VALID")

  const valid = fakeApi({ buildStates: ["VALID"] })
  const settled = await processed(valid)
  T("testflight access: a build already VALID returns without waiting", settled.processingState === "VALID" && settled.buildId === "build-1" && valid.calls.length === 1)
  const buildQuery = valid.calls[0].query
  T("testflight access: the build lookup uses only filters and values Apple documents", Object.keys(buildQuery).every((key) => apple.filters["builds:filter names"].includes(key)) &&
    buildQuery["filter[app]"] === "app-1" && buildQuery["filter[version]"] === "1" && buildQuery["filter[preReleaseVersion.version]"] === "1.3.152" &&
    apple.filters["builds:filter[preReleaseVersion.platform]"].includes(buildQuery["filter[preReleaseVersion.platform]"]) && valid.calls[0].path === "/v1/builds")

  const waiting = fakeApi({ buildStates: ["PROCESSING", null, "VALID"] })
  const ticks = clock()
  const afterWait = await processed(waiting, ticks)
  T("testflight access: a build still processing or not yet listed is polled until VALID", afterWait.processingState === "VALID" && waiting.calls.length === 3 && ticks.now() === 60_000)

  for (const failure of ["INVALID", "FAILED"]) {
    const failing = fakeApi({ buildStates: ["PROCESSING", failure] })
    const failingClock = clock()
    const message = await rejects(processed(failing, failingClock))
    T(`testflight access: ${failure} processing fails the run at once`, message === `Build 1.3.152 (1) processing ended as ${failure}` && failing.calls.length === 2 && failingClock.now() === 30_000)
  }
  const stuck = fakeApi({ buildStates: ["PROCESSING"] })
  const stuckClock = clock()
  const timeoutMessage = await rejects(processed(stuck, { ...stuckClock, timeoutMs: 120_000 }))
  T("testflight access: a build that stays PROCESSING fails at the timeout", timeoutMessage?.includes("before the timeout") === true && timeoutMessage.includes("PROCESSING") && stuckClock.now() <= 120_000 && stuck.calls.length === 5)
  const unlisted = await rejects(processed(fakeApi({ buildStates: [null] }), { ...clock(), timeoutMs: 60_000 }))
  T("testflight access: a build that never appears fails at the timeout", unlisted?.includes("not listed") === true)

  const existing = fakeApi({ groups: [group("group-1", "Orbit team")], members: [tester("tester-1", holder.toUpperCase())] })
  const unchanged = await ensureInternalTesterAccess({ client: clientFor(existing), appId: "app-1" })
  T("testflight access: a group with the account holder is left as it is", unchanged.groupName === "Orbit team" && !unchanged.createdGroup && !unchanged.addedTester && unchanged.testerCount === 1 &&
    existing.calls.every((call) => call.method === "GET"))
  const holderQuery = existing.calls.find((call) => call.path === "/v1/users").query
  T("testflight access: the account holder comes from the documented role filter", apple.filters["users:filter[roles]"].includes(holderQuery["filter[roles]"]) && holderQuery["filter[roles]"] === "ACCOUNT_HOLDER" &&
    Object.keys(holderQuery).every((key) => apple.filters["users:filter names"].includes(key)))

  const missingGroup = fakeApi({ groups: [] })
  const created = await ensureInternalTesterAccess({ client: clientFor(missingGroup), appId: "app-1" })
  const [groupBody] = bodiesOf(missingGroup, "POST", "/v1/betaGroups")
  T("testflight access: a missing group is created internal with access to all builds", created.createdGroup && created.addedTester && created.testerCount === 1 &&
    groupBody.data.attributes.isInternalGroup === true && groupBody.data.attributes.hasAccessToAllBuilds === true && groupBody.data.relationships.app.data.id === "app-1" &&
    violations({ $ref: "#/components/schemas/BetaGroupCreateRequest" }, groupBody).length === 0)
  const [testerBody] = bodiesOf(missingGroup, "POST", "/v1/betaTesters")
  T("testflight access: an unknown tester is created inside the group", testerBody?.data.attributes.email === holder && testerBody.data.relationships.betaGroups.data[0].id === "group-new" &&
    violations({ $ref: "#/components/schemas/BetaTesterCreateRequest" }, testerBody).length === 0)

  const wrongKind = fakeApi({ groups: [group("group-selected", "Selected builds", { hasAccessToAllBuilds: false }), group("group-external", "External", { isInternalGroup: false })] })
  await ensureInternalTesterAccess({ client: clientFor(wrongKind), appId: "app-1" })
  T("testflight access: an external group or a group without all builds is not reused", bodiesOf(wrongKind, "POST", "/v1/betaGroups").length === 1)

  const linked = fakeApi({ groups: [group("group-1", "Orbit team")], members: [tester("tester-2", "other@example.test")], knownTesters: [tester("tester-known", holder)] })
  const added = await ensureInternalTesterAccess({ client: clientFor(linked), appId: "app-1" })
  const [linkBody] = bodiesOf(linked, "POST", "/v1/betaGroups/group-1/relationships/betaTesters")
  T("testflight access: a known tester missing from the group is linked, not created", added.addedTester && !added.createdGroup && added.testerCount === 2 &&
    linkBody.data[0].id === "tester-known" && bodiesOf(linked, "POST", "/v1/betaTesters").length === 0 &&
    violations({ $ref: "#/components/schemas/BetaGroupBetaTestersLinkagesRequest" }, linkBody).length === 0)
  const testerQuery = linked.calls.find((call) => call.path === "/v1/betaTesters" && call.method === "GET").query
  T("testflight access: the tester lookup uses only filters Apple documents", Object.keys(testerQuery).every((key) => apple.filters["betaTesters:filter names"].includes(key)))

  const noHolder = await rejects(ensureInternalTesterAccess({ client: clientFor(fakeApi({ users: [] })), appId: "app-1" }))
  const twoHolders = await rejects(ensureInternalTesterAccess({ client: clientFor(fakeApi({ users: [user("a@example.test", ["ACCOUNT_HOLDER"]), user("b@example.test", ["ACCOUNT_HOLDER"])] })), appId: "app-1" }))
  T("testflight access: no account holder or two account holders fails before any write", noHolder?.includes("exactly one ACCOUNT_HOLDER") === true && twoHolders?.includes("exactly one ACCOUNT_HOLDER") === true)

  const lines = summaryLines({ version: "1.3.152", buildNumber: "1", processingState: "VALID", ...added }).join("\n")
  T("testflight access: the summary names state, group and tester count and no person", lines.includes("VALID") && lines.includes("Orbit team") && lines.includes("2") && !lines.includes(holder) && !lines.includes("example.test"))
  const failed = await rejects(ensureInternalTesterAccess({ client: apiClient(() => "t", async () => new Response("{}", { status: 403 })), appId: "app-1" }))
  T("testflight access: an API error names the path and status and never the person", failed === "App Store Connect GET /v1/users failed (HTTP 403)")

  const hosts = []
  const forged = await rejects(apiClient(() => "t", async (url) => {
    hosts.push(new URL(url).host)
    return Response.json({ data: [], links: { self: "x", next: "https://example.org/v1/users" } })
  }).getAll("/v1/users"))
  T("testflight access: a pagination link to another host is refused before any request", forged === "Invalid App Store Connect pagination link" && hosts.join() === "api.appstoreconnect.apple.com")
  let tokens = 0
  const fresh = fakeApi({})
  const counting = apiClient(() => `token-${++tokens}`, fresh.request)
  await counting.getAll("/v1/users")
  await counting.getAll("/v1/users")
  T("testflight access: each request signs its own token", tokens === 2 && fresh.calls[0].headers.Authorization === "Bearer token-1" && fresh.calls[1].headers.Authorization === "Bearer token-2")

  const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/ios-release.yml"), "utf8")
  const stepStart = workflow.indexOf("      - name: Wait for processing and give the internal tester access")
  const step = workflow.slice(stepStart, workflow.indexOf("      - name: Remove signing credentials"))
  T("testflight access: the release runs the tool once, after the upload and before the cleanup", stepStart > workflow.indexOf("xcrun altool --upload-app") &&
    step.length > 0 && (workflow.match(/tools\/testflight-access\.mjs/g) ?? []).length === 1 && step.includes("timeout-minutes: 30") &&
    step.includes('--app-id "$ORBIT_IOS_APP_STORE_ID"') && step.includes('--version "$APP_VERSION"') && step.includes('--build "$IOS_BUILD_NUMBER"') &&
    step.includes("APP_STORE_CONNECT_API_PRIVATE_KEY: ${{ secrets.APP_STORE_CONNECT_API_PRIVATE_KEY }}") && !step.includes("if:"))
}
