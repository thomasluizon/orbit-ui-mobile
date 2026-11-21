import { apiClient } from "../lib/app-store-connect.mjs"
import { ensureInternalTesterAccess, summaryLines, waitForProcessedBuild } from "../testflight-access.mjs"
import { T } from "./_harness.mjs"

const answer = (body, status = 200) => Response.json(body, { status })

const build = (processingState) => ({ type: "builds", id: "build-1", attributes: { version: "1", processingState } })
const group = (id, name, attributes = {}) => ({ type: "betaGroups", id, attributes: { name, isInternalGroup: true, hasAccessToAllBuilds: true, ...attributes } })
const tester = ({ id, email, firstName, lastName, state = "INSTALLED" }) => ({ type: "betaTesters", id, attributes: JSON.parse(JSON.stringify({ email, firstName, lastName, inviteType: "EMAIL", state })) })

/**
 * A fake App Store Connect with the real API's answers, for the routes the tool calls; any other route throws.
 * A person has a separate record, with its own id, in each app. POST /v1/betaTesters for a person with no record
 * in the group's app answers 201 and adds one. Nobody observed a create for a person with a record in the app,
 * so the fake throws there. It honours the documented filters and a page size.
 */
const fakeApi = ({ buildStates = ["VALID"], groups = [], pageSize = 200, rejectCreateFor = null }) => {
  const calls = []
  let createdCount = 0
  const remainingStates = [...buildStates]
  /** The records of one app, each record once. */
  const recordsOf = (appId) => [...new Map(groups.filter((entry) => entry.appId === appId)
    .flatMap((entry) => entry.testers).map((record) => [record.id, record])).values()]
  const request = async (url, options) => {
    const address = new URL(url)
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ method: options.method, path: address.pathname, query: Object.fromEntries(address.searchParams), body })
    const page = (data) => {
      const start = Number(address.searchParams.get("cursor") ?? 0)
      const next = new URL(address)
      next.searchParams.set("cursor", String(start + pageSize))
      return answer({ data: data.slice(start, start + pageSize), links: { self: String(url), ...(start + pageSize < data.length ? { next: String(next) } : {}) } })
    }
    const route = `${options.method} ${address.pathname}`
    if (route === "GET /v1/builds") {
      const state = remainingStates.length > 1 ? remainingStates.shift() : remainingStates[0]
      return page(state === null ? [] : [build(state)])
    }
    if (route === "GET /v1/apps/app-1/betaGroups") return page(groups.filter((entry) => entry.appId === "app-1").map(resourceOf))
    if (route === "GET /v1/betaGroups") {
      const internalOnly = address.searchParams.get("filter[isInternalGroup]") === "true"
      return page(groups.filter((entry) => !internalOnly || entry.attributes.isInternalGroup === true).map(resourceOf))
    }
    if (route === "POST /v1/betaGroups") {
      const created = group("group-new", body.data.attributes.name)
      groups.push({ ...created, appId: body.data.relationships.app.data.id, testers: [] })
      return answer({ data: created, links: { self: String(url) } }, 201)
    }
    const testersRoute = /^GET \/v1\/betaGroups\/([^/]+)\/betaTesters$/.exec(route)
    if (testersRoute) return page((groups.find((entry) => entry.id === testersRoute[1])?.testers ?? []).map(tester))
    if (route === "GET /v1/betaTesters") return page(recordsOf(address.searchParams.get("filter[apps]")).map(tester))
    if (route === "POST /v1/betaTesters") {
      const email = body.data.attributes.email
      // A schema-valid failure, not an observed answer: its detail repeats the address and a name to prove neither prints.
      if (email === rejectCreateFor) {
        return answer({ errors: [{ status: "409", code: "ENTITY_ERROR.ATTRIBUTE.INVALID", title: "An attribute value is invalid.", detail: `The tester ${email} cannot be created for Jane Doe` }] }, 409)
      }
      const target = groups.find((entry) => entry.id === body.data.relationships.betaGroups.data[0].id)
      if (recordsOf(target.appId).some((record) => record.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("nobody observed the answer to a create for a person who already has a tester record in the app")
      }
      const created = { id: `tester-created-${++createdCount}`, email, firstName: body.data.attributes.firstName, lastName: body.data.attributes.lastName, state: "INVITED" }
      target.testers.push(created)
      return answer({ data: tester(created), links: { self: String(url) } }, 201)
    }
    throw new Error(`the fake has no route for ${route}`)
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
  const valid = fakeApi({ buildStates: ["VALID"] })
  await processed(valid)
  T("testflight access: a build already VALID returns without waiting", valid.calls.length === 1)
  const buildQuery = valid.calls[0].query
  T("testflight access: the build lookup names the app, the build number and the version", valid.calls[0].path === "/v1/builds" &&
    buildQuery["filter[app]"] === "app-1" && buildQuery["filter[version]"] === "1" && buildQuery["filter[preReleaseVersion.version]"] === "1.3.152")

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
    createBody.data.relationships.betaGroups.data[0].id === "group-1" && createBody.data.attributes.firstName === "Firsta" && createBody.data.attributes.lastName === "Lasta")
  T("testflight access: a tester id of another app is never linked to this app's group", !other.calls.some((call) => call.path.endsWith("/relationships/betaTesters")))
  const listQuery = other.calls.find((call) => call.path === "/v1/betaGroups" && call.method === "GET").query
  T("testflight access: the group list asks for internal groups and the tester records name this app", listQuery["filter[isInternalGroup]"] === "true" &&
    other.calls.find((call) => call.path === "/v1/betaTesters" && call.method === "GET")?.query["filter[apps]"] === "app-1")

  const again = await access(other).catch((error) => ({ failure: error.message }))
  T("testflight access: a second run right after the first reads the group's members, adds nothing and passes", again.addedTesters === 0 && again.testerCount === 2 && again.testersOutsideGroup === 0 &&
    writesOf(other).length === 2, JSON.stringify(again))

  const differentCase = fakeApi({ groups: [
    teamGroup("group-1", "Orbit team", "app-1", [{ email: "Person@Example.TEST" }]),
    teamGroup("group-other", "Other app", "app-2", [{ email: "person@example.test" }, { email: "NEWBIE@example.test" }]),
    teamGroup("group-third", "Third app", "app-3", [{ email: "newbie@EXAMPLE.test" }]),
  ] })
  const caseResult = await access(differentCase)
  T("testflight access: the address match ignores case, so a person is neither created twice nor again", caseResult.addedTesters === 1 && caseResult.testerCount === 2 && writesOf(differentCase).length === 1 &&
    createdEmails(differentCase).join().toLowerCase() === "newbie@example.test")

  const missingGroup = fakeApi({ groups: [teamGroup("group-other", "Other app", "app-2", ["a"])] })
  const createdGroup = await access(missingGroup)
  const [groupBody] = bodiesOf(missingGroup, "POST", "/v1/betaGroups")
  const [groupTesterBody] = bodiesOf(missingGroup, "POST", "/v1/betaTesters")
  T("testflight access: a missing group is created internal with access to all builds and receives the testers", createdGroup.createdGroup && createdGroup.addedTesters === 1 && createdGroup.testerCount === 1 &&
    groupBody.data.attributes.isInternalGroup === true && groupBody.data.attributes.hasAccessToAllBuilds === true && groupBody.data.relationships.app.data.id === "app-1" && groupTesterBody.data.relationships.betaGroups.data[0].id === "group-new" && emailsIn(missingGroup, "group-new") === "a@example.test")

  const outside = fakeApi({ groups: [
    teamGroup("group-1", "Orbit team", "app-1", ["a"]),
    teamGroup("group-selected", "Selected builds", "app-1", ["x"], { hasAccessToAllBuilds: false }),
    teamGroup("group-other", "Other app", "app-2", ["a", "b", "x"]),
  ] })
  const outsideResult = await access(outside).catch((error) => ({ failure: error.message }))
  T("testflight access: a person with a tester record of this app outside the group gets no write and is counted", outsideResult.addedTesters === 1 && outsideResult.testersOutsideGroup === 1 &&
    outsideResult.testerCount === 2 && createdEmails(outside).join() === "b@example.test" && writesOf(outside).length === 1, JSON.stringify(outsideResult))
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
  // The body the real API answered to a GET with an invalid bearer token.
  const unauthorized = { errors: [{ status: "401", code: "NOT_AUTHORIZED", title: "Authentication credentials are missing or invalid.",
    detail: "Provide a properly configured and signed bearer token, and make sure that it has not expired. Learn more about Generating Tokens for API Requests https://developer.apple.com/go/?id=api-generating-tokens" }] }
  const failed = await rejects(ensureInternalTesterAccess({ client: apiClient(() => "t", async () => answer(unauthorized, 401)), appId: "app-1" }))
  T("testflight access: an API error names the path, status, code and title and never a person", failed === 'App Store Connect GET /v1/apps/app-1/betaGroups failed (HTTP 401): NOT_AUTHORIZED "Authentication credentials are missing or invalid."')
}
