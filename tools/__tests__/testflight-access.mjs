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

const build = (processingState) => ({ type: "builds", id: "build-1", attributes: { version: "1", processingState } })
const group = (id, name, attributes = {}) => ({ type: "betaGroups", id, attributes: { name, isInternalGroup: true, hasAccessToAllBuilds: true, ...attributes } })
const tester = (id) => ({ type: "betaTesters", id, attributes: { email: `${id}@example.test`, inviteType: "EMAIL", state: "INSTALLED" } })

/**
 * A fake App Store Connect that answers only documented paths and records every call. `groups` lists every
 * beta group of the team with its app id and testers. The fake honours the documented filters and a page size.
 */
const fakeApi = ({ buildStates = ["VALID"], groups = [], pageSize = 200 }) => {
  const calls = []
  const remainingStates = [...buildStates]
  const request = async (url, options) => {
    const address = new URL(url)
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ method: options.method, path: address.pathname, query: Object.fromEntries(address.searchParams), body, headers: options.headers })
    const page = (data, schema) => {
      const start = Number(address.searchParams.get("cursor") ?? 0)
      const next = new URL(address)
      next.searchParams.set("cursor", String(start + pageSize))
      const response = { data: data.slice(start, start + pageSize), links: { self: String(url), ...(start + pageSize < data.length ? { next: String(next) } : {}) } }
      const problems = violations({ $ref: schema }, response)
      if (problems.length) throw new Error(`fixture breaks Apple's ${schema} schema: ${problems.join("; ")}`)
      return Response.json(response)
    }
    const route = `${options.method} ${address.pathname}`
    if (route === "GET /v1/builds") {
      const state = remainingStates.length > 1 ? remainingStates.shift() : remainingStates[0]
      return page(state === null ? [] : [build(state)], "#/components/schemas/BuildsResponse")
    }
    if (route === "GET /v1/apps/app-1/betaGroups") return page(groups.filter((entry) => entry.appId === "app-1").map(resourceOf), "#/components/schemas/BetaGroupsResponse")
    if (route === "GET /v1/betaGroups") {
      const internalOnly = address.searchParams.get("filter[isInternalGroup]") === "true"
      return page(groups.filter((entry) => !internalOnly || entry.attributes.isInternalGroup === true).map(resourceOf), "#/components/schemas/BetaGroupsResponse")
    }
    if (route === "POST /v1/betaGroups") {
      const created = group("group-new", body.data.attributes.name)
      groups.push({ ...created, appId: body.data.relationships.app.data.id, testers: [] })
      return Response.json({ data: created, links: { self: String(url) } }, { status: 201 })
    }
    const testersRoute = /^GET \/v1\/betaGroups\/([^/]+)\/betaTesters$/.exec(route)
    if (testersRoute) return page((groups.find((entry) => entry.id === testersRoute[1])?.testers ?? []).map((id) => tester(id)), "#/components/schemas/BetaTestersResponse")
    const linkRoute = /^POST \/v1\/betaGroups\/([^/]+)\/relationships\/betaTesters$/.exec(route)
    if (linkRoute) {
      groups.find((entry) => entry.id === linkRoute[1]).testers.push(...body.data.map(({ id }) => id))
      return new Response(null, { status: 204 })
    }
    return new Response("{}", { status: 404 })
  }
  return { request, calls, groups }
}

const resourceOf = ({ appId, testers, ...resource }) => resource
const teamGroup = (id, name, appId, testers, attributes = {}) => ({ ...group(id, name, attributes), appId, testers })

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
  T("testflight access: fixture schemas come from Apple's specification", new URL(apple.source.split(" ")[0]).hostname === "developer.apple.com" && Object.keys(apple.pages).length === 6 &&
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

  const access = (api) => ensureInternalTesterAccess({ client: clientFor(api), appId: "app-1" })
  const writesOf = (api) => api.calls.filter((call) => call.method === "POST")
  const linkedIds = (api, groupId) => bodiesOf(api, "POST", `/v1/betaGroups/${groupId}/relationships/betaTesters`).flatMap((body) => body.data.map(({ id }) => id))

  const other = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-other", "Other app", "app-2", ["tester-a", "tester-b"])] })
  const linked = await access(other)
  const [linkBody] = bodiesOf(other, "POST", "/v1/betaGroups/group-1/relationships/betaTesters")
  T("testflight access: testers of another app's internal group are linked in one request", linked.linkedTesters === 2 && linked.testerCount === 2 && linked.groupName === "Orbit team" && !linked.createdGroup &&
    linkedIds(other, "group-1").join() === "tester-a,tester-b" && writesOf(other).length === 1 && violations({ $ref: "#/components/schemas/BetaGroupBetaTestersLinkagesRequest" }, linkBody).length === 0)
  const listQuery = other.calls.find((call) => call.path === "/v1/betaGroups" && call.method === "GET").query
  T("testflight access: the group list uses only filters Apple documents and asks for internal groups", Object.keys(listQuery).every((key) => apple.filters["betaGroups:filter names"].includes(key)) && listQuery["filter[isInternalGroup]"] === "true")
  T("testflight access: the tester lists use only parameters Apple documents", other.calls.filter((call) => /^\/v1\/betaGroups\/[^/]+\/betaTesters$/.test(call.path)).every((call) => Object.keys(call.query).every((key) => apple.filters["betaGroup testers:parameters"].includes(key))))

  const partial = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["tester-a"]), teamGroup("group-other", "Other app", "app-2", ["tester-a", "tester-b"])] })
  const topped = await access(partial)
  T("testflight access: a tester already in the target group is not linked again", topped.linkedTesters === 1 && topped.testerCount === 2 && linkedIds(partial, "group-1").join() === "tester-b")

  const complete = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["tester-a", "tester-b"]), teamGroup("group-other", "Other app", "app-2", ["tester-a", "tester-b"])] })
  const unchanged = await access(complete)
  T("testflight access: a target group that already holds every tester is left as it is", unchanged.linkedTesters === 0 && unchanged.testerCount === 2 && !unchanged.createdGroup && writesOf(complete).length === 0)

  const onlyOwn = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["tester-a"]), teamGroup("group-other", "Other app", "app-2", [])] })
  const own = await access(onlyOwn)
  T("testflight access: the target group's own testers count in the total but are not a source", own.testerCount === 1 && own.linkedTesters === 0 && writesOf(onlyOwn).length === 0)
  const ownOnlySource = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["tester-a"])] })
  const ownCall = await access(ownOnlySource)
  T("testflight access: the target group is not read as a source group", ownCall.linkedTesters === 0 && ownOnlySource.calls.filter((call) => call.path === "/v1/betaGroups/group-1/betaTesters").length === 1)

  const external = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["tester-a"]), teamGroup("group-external", "External", "app-2", ["tester-x"], { isInternalGroup: false })] })
  const ignored = await access(external)
  T("testflight access: the testers of an external group are not a source", ignored.linkedTesters === 0 && ignored.testerCount === 1 && writesOf(external).length === 0 &&
    !external.calls.some((call) => call.path === "/v1/betaGroups/group-external/betaTesters"))

  const missingGroup = fakeApi({ groups: [teamGroup("group-other", "Other app", "app-2", ["tester-a"])] })
  const created = await access(missingGroup)
  const [groupBody] = bodiesOf(missingGroup, "POST", "/v1/betaGroups")
  T("testflight access: a missing group is created internal with access to all builds and receives the testers", created.createdGroup && created.linkedTesters === 1 && created.testerCount === 1 &&
    groupBody.data.attributes.isInternalGroup === true && groupBody.data.attributes.hasAccessToAllBuilds === true && groupBody.data.relationships.app.data.id === "app-1" &&
    violations({ $ref: "#/components/schemas/BetaGroupCreateRequest" }, groupBody).length === 0 && linkedIds(missingGroup, "group-new").join() === "tester-a")

  const wrongKind = fakeApi({ groups: [teamGroup("group-selected", "Selected builds", "app-1", [], { hasAccessToAllBuilds: false }), teamGroup("group-external", "External", "app-1", [], { isInternalGroup: false }), teamGroup("group-other", "Other app", "app-2", ["tester-a"])] })
  await access(wrongKind)
  T("testflight access: an external group or a group without all builds is not reused", bodiesOf(wrongKind, "POST", "/v1/betaGroups").length === 1)

  const nobody = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-external", "External", "app-2", ["tester-x"], { isInternalGroup: false })] })
  const nobodyMessage = await rejects(access(nobody))
  const noGroup = fakeApi({ groups: [] })
  const noGroupMessage = await rejects(access(noGroup))
  T("testflight access: zero testers fails before any write", nobodyMessage?.includes("nobody could install the build") === true && noGroupMessage?.includes("nobody could install the build") === true &&
    writesOf(nobody).length === 0 && writesOf(noGroup).length === 0)

  const crowded = fakeApi({ pageSize: 2, groups: [
    teamGroup("group-1", "Orbit team", "app-1", ["tester-a"]),
    ...["one", "two", "three", "four", "five"].map((name, index) => teamGroup(`group-${name}`, name, "app-2", [`tester-${name}`, "tester-a", "tester-shared", `tester-extra-${index}`])),
  ] })
  const crowdedResult = await access(crowded)
  const crowdedLinked = linkedIds(crowded, "group-1")
  T("testflight access: paginated group lists and tester lists are read to the end and deduplicated", crowdedResult.linkedTesters === 11 && crowdedLinked.length === 11 && new Set(crowdedLinked).size === 11 && crowdedLinked.includes("tester-shared") && crowdedLinked.includes("tester-five") && crowdedLinked.includes("tester-extra-4"))
  const pagedMembers = fakeApi({ pageSize: 2, groups: [teamGroup("group-1", "Orbit team", "app-1", ["tester-a", "tester-b", "tester-c", "tester-d", "tester-e"]), teamGroup("group-other", "Other app", "app-2", ["tester-e", "tester-f"])] })
  const pagedResult = await access(pagedMembers)
  T("testflight access: a target group with several pages of testers is read to the end", pagedResult.testerCount === 6 && pagedResult.linkedTesters === 1 && linkedIds(pagedMembers, "group-1").join() === "tester-f")

  const lines = summaryLines({ version: "1.3.152", buildNumber: "1", processingState: "VALID", ...linked }).join("\n")
  T("testflight access: the summary names state, group, tester count and linked count and no person", lines.includes("VALID") && lines.includes("Orbit team") && lines.includes("Testers in the group: 2") && lines.includes("Testers linked by this run: 2") &&
    !lines.includes("example.test") && !lines.includes("tester-a"))
  const failed = await rejects(ensureInternalTesterAccess({ client: apiClient(() => "t", async () => new Response("{}", { status: 403 })), appId: "app-1" }))
  T("testflight access: an API error names the path and status and never a person", failed === "App Store Connect GET /v1/apps/app-1/betaGroups failed (HTTP 403)")

  const hosts = []
  const forged = await rejects(apiClient(() => "t", async (url) => {
    hosts.push(new URL(url).host)
    return Response.json({ data: [], links: { self: "x", next: "https://example.org/v1/betaGroups" } })
  }).getAll("/v1/betaGroups"))
  T("testflight access: a pagination link to another host is refused before any request", forged === "Invalid App Store Connect pagination link" && hosts.join() === "api.appstoreconnect.apple.com")
  let tokens = 0
  const fresh = fakeApi({})
  const counting = apiClient(() => `token-${++tokens}`, fresh.request)
  await counting.getAll("/v1/betaGroups")
  await counting.getAll("/v1/betaGroups")
  T("testflight access: each request signs its own token", tokens === 2 && fresh.calls[0].headers.Authorization === "Bearer token-1" && fresh.calls[1].headers.Authorization === "Bearer token-2")

  const workflow = readFileSync(join(REPO_ROOT, ".github/workflows/ios-release.yml"), "utf8")
  const jobStart = workflow.indexOf("\n  testflight-access:\n")
  const job = jobStart === -1 ? "" : workflow.slice(jobStart)
  const releaseJob = workflow.slice(0, jobStart)
  T("testflight access: its own job needs the release, runs on Ubuntu, has a 30 minute limit and uses the release environment", job.length > 0 &&
    job.includes("    needs: release\n") && job.includes("    runs-on: ubuntu-latest\n") && job.includes("    timeout-minutes: 30\n") &&
    job.includes("    environment: ios-${{ inputs.variant }}\n") && !job.includes("permissions:") && !job.includes("if:"))
  T("testflight access: the job runs the tool once with the app id, version and build, and the release job never runs it", job.length > 0 &&
    (workflow.match(/tools\/testflight-access\.mjs/g) ?? []).length === 1 && !releaseJob.includes("testflight-access") &&
    job.includes("actions/checkout@v7") && job.includes("actions/setup-node@v7") &&
    job.includes('--app-id "$ORBIT_IOS_APP_STORE_ID"') && job.includes('--version "$APP_VERSION"') && job.includes('--build "$IOS_BUILD_NUMBER"') &&
    job.includes("ORBIT_IOS_APP_STORE_ID: ${{ vars.ORBIT_IOS_APP_STORE_ID }}") && job.includes("APP_VERSION: ${{ inputs.app_version }}") &&
    job.includes("IOS_BUILD_NUMBER: ${{ inputs.build_number }}") &&
    job.includes("APP_STORE_CONNECT_API_PRIVATE_KEY: ${{ secrets.APP_STORE_CONNECT_API_PRIVATE_KEY }}") &&
    job.includes("APP_STORE_CONNECT_API_KEY_ID: ${{ secrets.APP_STORE_CONNECT_API_KEY_ID }}") &&
    job.includes("APP_STORE_CONNECT_API_ISSUER_ID: ${{ secrets.APP_STORE_CONNECT_API_ISSUER_ID }}"))
}
