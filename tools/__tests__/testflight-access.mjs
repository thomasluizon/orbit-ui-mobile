import { readFileSync } from "node:fs"
import { join } from "node:path"
import { apiClient } from "../lib/app-store-connect.mjs"
import { ensureInternalTesterAccess, summaryLines, waitForProcessedBuild } from "../testflight-access.mjs"
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
const tester = ({ id, email, firstName, lastName, state = "INSTALLED" }) => ({ type: "betaTesters", id, attributes: JSON.parse(JSON.stringify({ email, firstName, lastName, inviteType: "EMAIL", state })) })

/**
 * A fake App Store Connect with the real API's answers. A person has a separate record, with its own id, in each
 * app. A link of another app's record answers 409 STATE_ERROR. POST /v1/betaTesters for a person with no record in
 * the group's app answers 201 and adds one. Nobody observed a link of the app's own record or a create for a person
 * with a record in the app, so the fake throws there. It honours the documented filters and a page size.
 */
const fakeApi = ({ buildStates = ["VALID"], groups = [], pageSize = 200, rejectCreateFor = null }) => {
  const calls = []
  let createdCount = 0
  const remainingStates = [...buildStates]
  /** The records of one app, or of every app when appId is null, each record once. */
  const recordsOf = (appId) => [...new Map(groups.filter((entry) => appId === null || entry.appId === appId)
    .flatMap((entry) => entry.testers).map((record) => [record.id, record])).values()]
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
    if (testersRoute) return page((groups.find((entry) => entry.id === testersRoute[1])?.testers ?? []).map(tester), "#/components/schemas/BetaTestersResponse")
    if (route === "GET /v1/betaTesters") return page(recordsOf(address.searchParams.get("filter[apps]")).map(tester), "#/components/schemas/BetaTestersResponse")
    const linkRoute = /^POST \/v1\/betaGroups\/([^/]+)\/relationships\/betaTesters$/.exec(route)
    if (linkRoute) {
      const ownIds = new Set(recordsOf(groups.find((entry) => entry.id === linkRoute[1]).appId).map(({ id }) => id))
      if (body.data.some(({ id }) => ownIds.has(id))) throw new Error("nobody observed the answer to a link of the app's own tester record")
      return Response.json({ errors: [{ id: "error-1", status: "409", code: "STATE_ERROR", title: "The request cannot be fulfilled because of the state of another resource.", detail: "Tester(s) cannot be assigned" }] }, { status: 409 })
    }
    if (route === "POST /v1/betaTesters") {
      const problems = violations({ $ref: "#/components/schemas/BetaTesterCreateRequest" }, body)
      if (problems.length) throw new Error(`request breaks Apple's BetaTesterCreateRequest schema: ${problems.join("; ")}`)
      const email = body.data.attributes.email
      if (email === rejectCreateFor) {
        return Response.json({ errors: [{ id: "error-2", status: "409", code: "ENTITY_ERROR.ATTRIBUTE.INVALID", title: "An attribute value is invalid.", detail: `The tester ${email} cannot be created for Jane Doe` }] }, { status: 409 })
      }
      const target = groups.find((entry) => entry.id === body.data.relationships.betaGroups.data[0].id)
      if (recordsOf(target.appId).some((record) => record.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("nobody observed the answer to a create for a person who already has a tester record in the app")
      }
      const created = { id: `tester-created-${++createdCount}`, email, firstName: body.data.attributes.firstName, lastName: body.data.attributes.lastName, state: "INVITED" }
      target.testers.push(created)
      return Response.json({ data: tester(created), links: { self: String(url) } }, { status: 201 })
    }
    return new Response("{}", { status: 404 })
  }
  return { request, calls, groups }
}

const resourceOf = ({ appId, testers, ...resource }) => resource
/** A person is a key. The record of that person in one app has its own id, as the real API answered. */
const personOf = (appId, key) => typeof key === "string"
  ? { id: `${appId}-tester-${key}`, email: `${key}@example.test`, firstName: `First${key}`, lastName: `Last${key}` }
  : { id: `${appId}-tester-${key.email}`, ...key }
const teamGroup = (id, name, appId, people, attributes = {}) => ({ ...group(id, name, attributes), appId, testers: people.map((key) => personOf(appId, key)) })

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
  T("testflight access: fixture schemas come from Apple's specification", new URL(apple.source.split(" ")[0]).hostname === "developer.apple.com" && Object.keys(apple.pages).length === 7 &&
    Object.values(apple.pages).every((page) => page.startsWith("https://developer.apple.com/documentation/appstoreconnectapi/")) &&
    apple.schemas.Build.properties.attributes.properties.processingState.enum.join() === "PROCESSING,FAILED,INVALID,VALID")

  const valid = fakeApi({ buildStates: ["VALID"] })
  await processed(valid)
  T("testflight access: a build already VALID returns without waiting", valid.calls.length === 1)
  const buildQuery = valid.calls[0].query
  T("testflight access: the build lookup uses only filters and values Apple documents", Object.keys(buildQuery).every((key) => apple.filters["builds:filter names"].includes(key)) &&
    buildQuery["filter[app]"] === "app-1" && buildQuery["filter[version]"] === "1" && buildQuery["filter[preReleaseVersion.version]"] === "1.3.152" &&
    apple.filters["builds:filter[preReleaseVersion.platform]"].includes(buildQuery["filter[preReleaseVersion.platform]"]) && valid.calls[0].path === "/v1/builds")

  const waiting = fakeApi({ buildStates: ["PROCESSING", null, "VALID"] })
  const ticks = clock()
  await processed(waiting, ticks)
  T("testflight access: a build still processing or not yet listed is polled until VALID", waiting.calls.length === 3 && ticks.now() === 60_000)

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
  const createdEmails = (api) => bodiesOf(api, "POST", "/v1/betaTesters").map((body) => body.data.attributes.email)
  const emailsIn = (api, groupId) => api.groups.find((entry) => entry.id === groupId).testers.map(({ email }) => email.toLowerCase()).sort().join()
  const exampleGroups = () => [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-other", "Other app", "app-2", ["a", "b"])]

  const other = fakeApi({ groups: exampleGroups() })
  const created = await access(other)
  const [createBody] = bodiesOf(other, "POST", "/v1/betaTesters")
  T("testflight access: a tester of another app's internal group gets access to this app's group", created.addedTesters === 2 && created.testerCount === 2 && created.groupName === "Orbit team" && !created.createdGroup &&
    emailsIn(other, "group-1") === "a@example.test,b@example.test" && createdEmails(other).join() === "a@example.test,b@example.test" && writesOf(other).length === 2 &&
    createBody.data.relationships.betaGroups.data[0].id === "group-1" && createBody.data.attributes.firstName === "Firsta" && createBody.data.attributes.lastName === "Lasta" &&
    violations({ $ref: "#/components/schemas/BetaTesterCreateRequest" }, createBody).length === 0)
  T("testflight access: a tester id of another app is never linked to this app's group", !other.calls.some((call) => call.path.endsWith("/relationships/betaTesters")))
  const listQuery = other.calls.find((call) => call.path === "/v1/betaGroups" && call.method === "GET").query
  T("testflight access: the group list uses only filters Apple documents and asks for internal groups", Object.keys(listQuery).every((key) => apple.filters["betaGroups:filter names"].includes(key)) && listQuery["filter[isInternalGroup]"] === "true")
  const appGroupsQuery = other.calls.find((call) => call.path === "/v1/apps/app-1/betaGroups" && call.method === "GET").query
  T("testflight access: the app's group list uses only parameters Apple documents", Object.keys(appGroupsQuery).every((key) => apple.filters["betaGroups of app:parameters"].includes(key)))
  T("testflight access: the tester lists use only parameters Apple documents", other.calls.filter((call) => /^\/v1\/betaGroups\/[^/]+\/betaTesters$/.test(call.path)).every((call) => Object.keys(call.query).every((key) => apple.filters["betaGroup testers:parameters"].includes(key))))
  const appRecordsQuery = other.calls.find((call) => call.path === "/v1/betaTesters" && call.method === "GET")?.query ?? {}
  T("testflight access: the list of this app's tester records uses only filters Apple documents and names this app", Object.keys(appRecordsQuery).every((key) => apple.filters["betaTesters:filter names"].includes(key)) &&
    appRecordsQuery["filter[apps]"] === "app-1")

  const again = await access(other).catch((error) => ({ failure: error.message }))
  T("testflight access: a second run right after the first reads the group's members, adds nothing and passes", again.addedTesters === 0 && again.testerCount === 2 && again.testersOutsideGroup === 0 &&
    writesOf(other).length === 2, JSON.stringify(again))

  const unnamed = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-other", "Other app", "app-2", [{ email: "solo@example.test" }])] })
  await access(unnamed)
  const [unnamedBody] = bodiesOf(unnamed, "POST", "/v1/betaTesters")
  T("testflight access: a person without a name is created without name attributes", Object.keys(unnamedBody.data.attributes).join() === "email" && violations({ $ref: "#/components/schemas/BetaTesterCreateRequest" }, unnamedBody).length === 0)

  const partial = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["a"]), teamGroup("group-other", "Other app", "app-2", ["a", "b"])] })
  const topped = await access(partial)
  T("testflight access: a person the group already holds is left alone and a missing person is created", topped.addedTesters === 1 && topped.testerCount === 2 && createdEmails(partial).join() === "b@example.test")

  const complete = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["a", "b"]), teamGroup("group-other", "Other app", "app-2", ["a", "b"])] })
  const unchanged = await access(complete)
  T("testflight access: nobody missing means no write", unchanged.addedTesters === 0 && unchanged.testerCount === 2 && !unchanged.createdGroup && writesOf(complete).length === 0)

  const differentCase = fakeApi({ groups: [
    teamGroup("group-1", "Orbit team", "app-1", [{ email: "Person@Example.TEST" }]),
    teamGroup("group-other", "Other app", "app-2", [{ email: "person@example.test" }, { email: "NEWBIE@example.test" }]),
    teamGroup("group-third", "Third app", "app-3", [{ email: "newbie@EXAMPLE.test" }]),
  ] })
  const caseResult = await access(differentCase)
  T("testflight access: the address match ignores case, so a person is neither created twice nor again", caseResult.addedTesters === 1 && caseResult.testerCount === 2 && writesOf(differentCase).length === 1 &&
    createdEmails(differentCase).join().toLowerCase() === "newbie@example.test")

  const twice = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-one", "One", "app-2", ["a", "b"]), teamGroup("group-two", "Two", "app-3", ["b", "c"])] })
  const twiceResult = await access(twice)
  T("testflight access: a person in two other groups is created once", twiceResult.addedTesters === 3 && createdEmails(twice).sort().join() === "a@example.test,b@example.test,c@example.test" && writesOf(twice).length === 3)

  const onlyOwn = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["a"]), teamGroup("group-other", "Other app", "app-2", [])] })
  const own = await access(onlyOwn)
  T("testflight access: the target group's own testers count in the total but are not a source", own.testerCount === 1 && own.addedTesters === 0 && writesOf(onlyOwn).length === 0)
  const ownOnlySource = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["a"])] })
  const ownCall = await access(ownOnlySource)
  T("testflight access: the target group is not read as a source group", ownCall.addedTesters === 0 && ownOnlySource.calls.filter((call) => call.path === "/v1/betaGroups/group-1/betaTesters").length === 1)

  const external = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", ["a"]), teamGroup("group-external", "External", "app-2", ["x"], { isInternalGroup: false })] })
  const ignored = await access(external)
  T("testflight access: the testers of an external group are not a source", ignored.addedTesters === 0 && ignored.testerCount === 1 && writesOf(external).length === 0 &&
    !external.calls.some((call) => call.path === "/v1/betaGroups/group-external/betaTesters"))

  const missingGroup = fakeApi({ groups: [teamGroup("group-other", "Other app", "app-2", ["a"])] })
  const createdGroup = await access(missingGroup)
  const [groupBody] = bodiesOf(missingGroup, "POST", "/v1/betaGroups")
  const [groupTesterBody] = bodiesOf(missingGroup, "POST", "/v1/betaTesters")
  T("testflight access: a missing group is created internal with access to all builds and receives the testers", createdGroup.createdGroup && createdGroup.addedTesters === 1 && createdGroup.testerCount === 1 &&
    groupBody.data.attributes.isInternalGroup === true && groupBody.data.attributes.hasAccessToAllBuilds === true && groupBody.data.relationships.app.data.id === "app-1" &&
    violations({ $ref: "#/components/schemas/BetaGroupCreateRequest" }, groupBody).length === 0 && groupTesterBody.data.relationships.betaGroups.data[0].id === "group-new" && emailsIn(missingGroup, "group-new") === "a@example.test")

  const wrongKind = fakeApi({ groups: [teamGroup("group-selected", "Selected builds", "app-1", [], { hasAccessToAllBuilds: false }), teamGroup("group-external", "External", "app-1", [], { isInternalGroup: false }), teamGroup("group-other", "Other app", "app-2", ["a"])] })
  await access(wrongKind)
  T("testflight access: an external group or a group without all builds is not reused", bodiesOf(wrongKind, "POST", "/v1/betaGroups").length === 1)

  const outside = fakeApi({ groups: [
    teamGroup("group-1", "Orbit team", "app-1", ["a"]),
    teamGroup("group-selected", "Selected builds", "app-1", ["x"], { hasAccessToAllBuilds: false }),
    teamGroup("group-external", "External", "app-1", ["y"], { isInternalGroup: false }),
    teamGroup("group-other", "Other app", "app-2", ["a", "b", "x", "y"]),
  ] })
  const outsideResult = await access(outside).catch((error) => ({ failure: error.message }))
  T("testflight access: a person with a tester record of this app outside the group gets no write and is counted", outsideResult.addedTesters === 1 && outsideResult.testersOutsideGroup === 2 &&
    outsideResult.testerCount === 2 && createdEmails(outside).join() === "b@example.test" && writesOf(outside).length === 1, JSON.stringify(outsideResult))
  const pagedRecords = fakeApi({ pageSize: 2, groups: [
    teamGroup("group-1", "Orbit team", "app-1", []),
    teamGroup("group-selected", "Selected builds", "app-1", ["p", "q", "r"], { hasAccessToAllBuilds: false }),
    teamGroup("group-other", "Other app", "app-2", ["p", "q", "r", "s"]),
  ] })
  const pagedRecordsResult = await access(pagedRecords).catch((error) => ({ failure: error.message }))
  T("testflight access: the list of this app's tester records is read to the end", pagedRecordsResult.addedTesters === 1 && pagedRecordsResult.testersOutsideGroup === 3 &&
    createdEmails(pagedRecords).join() === "s@example.test", JSON.stringify(pagedRecordsResult))

  const nobody = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-external", "External", "app-2", ["x"], { isInternalGroup: false })] })
  const nobodyMessage = await rejects(access(nobody))
  const noGroup = fakeApi({ groups: [] })
  const noGroupMessage = await rejects(access(noGroup))
  const onlyOutside = fakeApi({ groups: [
    teamGroup("group-1", "Orbit team", "app-1", []),
    teamGroup("group-selected", "Selected builds", "app-1", ["x"], { hasAccessToAllBuilds: false }),
    teamGroup("group-other", "Other app", "app-2", ["x"]),
  ] })
  const onlyOutsideMessage = await rejects(access(onlyOutside))
  T("testflight access: zero testers fails before any write", [nobodyMessage, noGroupMessage, onlyOutsideMessage].every((message) => message?.includes("nobody could install the build") === true) &&
    [nobody, noGroup, onlyOutside].every((api) => writesOf(api).length === 0), JSON.stringify([nobodyMessage, noGroupMessage, onlyOutsideMessage]))

  const crowded = fakeApi({ pageSize: 2, groups: [
    teamGroup("group-1", "Orbit team", "app-1", ["a"]),
    ...["one", "two", "three", "four", "five"].map((name, index) => teamGroup(`group-${name}`, name, "app-2", [name, "a", "shared", `extra${index}`])),
  ] })
  const crowdedResult = await access(crowded)
  const crowdedCreated = createdEmails(crowded)
  T("testflight access: paginated group lists and tester lists are read to the end and deduplicated", crowdedResult.addedTesters === 11 && crowdedCreated.length === 11 && new Set(crowdedCreated).size === 11 &&
    crowdedCreated.includes("shared@example.test") && crowdedCreated.includes("five@example.test") && crowdedCreated.includes("extra4@example.test") && !crowdedCreated.includes("a@example.test"))
  const pagedMembers = fakeApi({ pageSize: 2, groups: [teamGroup("group-1", "Orbit team", "app-1", ["a", "b", "c", "d", "e"]), teamGroup("group-other", "Other app", "app-2", ["e", "f"])] })
  const pagedResult = await access(pagedMembers)
  T("testflight access: a target group with several pages of testers is read to the end", pagedResult.testerCount === 6 && pagedResult.addedTesters === 1 && createdEmails(pagedMembers).join() === "f@example.test")

  const output = []
  const consoleMethods = ["log", "info", "warn", "error"].map((name) => [name, console[name]])
  for (const [name] of consoleMethods) console[name] = (...parts) => output.push(parts.join(" "))
  const rejecting = fakeApi({ groups: [teamGroup("group-1", "Orbit team", "app-1", []), teamGroup("group-other", "Other app", "app-2", ["a", "bad"])], rejectCreateFor: "bad@example.test" })
  let failureMessage
  try { failureMessage = await rejects(access(rejecting)) } finally { for (const [name, original] of consoleMethods) console[name] = original }
  T("testflight access: a failed create fails the run with the error code and title and no address or name", failureMessage?.includes("(HTTP 409)") === true && failureMessage.includes("ENTITY_ERROR.ATTRIBUTE.INVALID") && failureMessage.includes("An attribute value is invalid.") &&
    !/example\.test|Jane|Doe|Firstbad|Lastbad/.test(failureMessage) && output.every((line) => !/example\.test|Firstbad|Lastbad/.test(line)))

  const lines = summaryLines({ version: "1.3.152", buildNumber: "1", ...created }).join("\n")
  T("testflight access: the summary names state, group, tester count and added count and no person", lines.includes("Build 1.3.152 (1) processing state: VALID") && lines.includes("Orbit team") && lines.includes("Testers in the group: 2") && lines.includes("Testers added by this run: 2") &&
    !lines.includes("example.test") && !lines.includes("Firsta"))
  const outsideLines = summaryLines({ version: "1.3.152", buildNumber: "1", ...outsideResult }).join("\n")
  T("testflight access: the summary counts this app's testers outside the group only when there are some", outsideLines.includes("- Testers of this app outside the group, not changed: 2") &&
    !lines.includes("outside the group"))
  const failed = await rejects(ensureInternalTesterAccess({ client: apiClient(() => "t", async () => new Response("{}", { status: 403 })), appId: "app-1" }))
  T("testflight access: an API error names the path and status and never a person", failed === "App Store Connect GET /v1/apps/app-1/betaGroups failed (HTTP 403)")

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
  const stepStart = job.indexOf("      - name: Wait for processing and give the internal tester access\n")
  const beforeToolStep = stepStart === -1 ? job : job.slice(0, stepStart)
  const toolStep = stepStart === -1 ? "" : job.slice(stepStart)
  T("testflight access: only the tool step receives the App Store Connect credentials, not checkout or setup-node", toolStep.length > 0 &&
    !beforeToolStep.includes("\n    env:\n") && toolStep.startsWith("      - name: Wait for processing and give the internal tester access\n        env:\n") &&
    ["APP_STORE_CONNECT_API_KEY_ID", "APP_STORE_CONNECT_API_ISSUER_ID", "APP_STORE_CONNECT_API_PRIVATE_KEY"].every((name) =>
      !beforeToolStep.includes(name) && toolStep.includes(`          ${name}: \${{ secrets.${name} }}\n`)))
}
