import { isDeepStrictEqual } from "node:util"
import { apiClient } from "../lib/app-store-connect.mjs"
import { T } from "./_harness.mjs"

const rejects = async (promise) => { try { await promise; return null } catch (error) { return error.message } }

/** A fake App Store Connect that records every call and answers with `respond`. */
const recording = (respond) => {
  const calls = []
  const request = async (url, options) => {
    calls.push({ ...options, url: new URL(url) })
    return respond(new URL(url), options)
  }
  return { calls, request }
}

/** A fake that answers each call with the next status of the list, and the wait recorder that stands in for the timer. */
const scripted = (statuses, success) => {
  const waits = []
  const api = recording(() => {
    const status = statuses[api.calls.length - 1]
    return status < 300 ? Response.json(success, { status }) : Response.json({ errors: [{ status: String(status), code: "UNEXPECTED_ERROR", title: "An unexpected error occurred." }] }, { status })
  })
  return { ...api, waits, wait: async (milliseconds) => { waits.push(milliseconds) } }
}

const RETRY_WAITS = "1000,4000,16000"

export const cases = async () => {
  const paged = recording((url) => Response.json({
    data: [{ type: "betaGroups", id: url.searchParams.get("cursor") ?? "first" }],
    links: { self: String(url), ...(url.searchParams.has("cursor") ? {} : { next: "/v1/betaGroups?cursor=second&limit=2" }) },
  }))
  const resources = await apiClient(() => "token", paged.request).getAll("/v1/betaGroups", { limit: "2" })
  T("app store connect: every page is read to the end with GET, the query and a request deadline", resources.map(({ id }) => id).join() === "first,second" &&
    paged.calls.length === 2 && paged.calls[0].url.href === "https://api.appstoreconnect.apple.com/v1/betaGroups?limit=2" &&
    paged.calls.every((call) => call.method === "GET" && call.signal instanceof AbortSignal && !Object.hasOwn(call.headers, "Content-Type")))

  for (const [label, next] of [
    ["a pagination link to another host", "https://example.org/v1/betaGroups"],
    ["a pagination link to another path", "https://api.appstoreconnect.apple.com/v1/apps"],
    ["a pagination link already read", "/v1/betaGroups"],
  ]) {
    const api = recording((url) => Response.json({ data: [], links: { self: String(url), next } }))
    const message = await rejects(apiClient(() => "token", api.request).getAll("/v1/betaGroups"))
    T(`app store connect: ${label} is refused before any request`, message === "Invalid App Store Connect pagination link" &&
      api.calls.map((call) => call.url.host).join() === "api.appstoreconnect.apple.com")
  }

  // Apple's spec answers POST /v1/betaTesters with 201 and a BetaTesterResponse. The request body and this answer agree
  // with the BetaTesterCreateRequest and BetaTesterResponse schemas in fixtures/app-store-connect-testflight-schemas.json.
  const createRequest = { data: { type: "betaTesters", attributes: { email: "person@example.test" }, relationships: { betaGroups: { data: [{ type: "betaGroups", id: "group-1" }] } } } }
  const createdTester = { data: { type: "betaTesters", id: "tester-1", attributes: { email: "person@example.test", inviteType: "EMAIL", state: "INVITED" } }, links: { self: "https://api.appstoreconnect.apple.com/v1/betaTesters/tester-1" } }
  const created = recording(() => Response.json(createdTester, { status: 201 }))
  const answer = await apiClient(() => "token", created.request).post("/v1/betaTesters", createRequest)
  const [createCall] = created.calls
  T("app store connect: a POST sends the body as JSON with its content type and returns the parsed answer", isDeepStrictEqual(answer, createdTester) &&
    created.calls.length === 1 && createCall.method === "POST" && createCall.url.href === "https://api.appstoreconnect.apple.com/v1/betaTesters" &&
    createCall.headers["Content-Type"] === "application/json" && createCall.body === JSON.stringify(createRequest))

  let tokens = 0
  const signed = recording((url, options) => (options.method === "POST" ? Response.json(createdTester, { status: 201 }) : Response.json({ data: [], links: { self: String(url) } })))
  const client = apiClient(() => `token-${++tokens}`, signed.request)
  await client.getAll("/v1/betaGroups")
  await client.post("/v1/betaTesters", createRequest)
  T("app store connect: each request signs its own token", tokens === 2 && signed.calls.map((call) => call.headers.Authorization).join() === "Bearer token-1,Bearer token-2")

  const denied = await rejects(apiClient(() => "token", async () => new Response("{}", { status: 403 })).getAll("/v1/betaGroups"))
  T("app store connect: an HTTP failure names the method, the path and the status", denied === "App Store Connect GET /v1/betaGroups failed (HTTP 403)")
  const detailed = await rejects(apiClient(() => "token", async () => Response.json({ errors: [{ id: "e1", status: "409", code: "STATE_ERROR", title: "The request cannot be fulfilled because of the state of another resource.", detail: "Tester(s) cannot be assigned: person@example.test" }] }, { status: 409 })).post("/v1/betaTesters", {}))
  T("app store connect: a failure adds the first error's code and title and never the detail", detailed === 'App Store Connect POST /v1/betaTesters failed (HTTP 409): STATE_ERROR "The request cannot be fulfilled because of the state of another resource."')
  const addressed = await rejects(apiClient(() => "token", async () => Response.json({ errors: [{ status: "409", code: "ENTITY_ERROR", title: "Tester person@example.test exists", detail: "x" }] }, { status: 409 })).post("/v1/betaTesters", {}))
  T("app store connect: an e-mail address inside an error title is replaced", addressed === 'App Store Connect POST /v1/betaTesters failed (HTTP 409): ENTITY_ERROR "Tester [address] exists"')
  const notJson = await rejects(apiClient(() => "token", async () => new Response("<html>bad gateway</html>", { status: 502 }), async () => {}).getAll("/v1/betaGroups"))
  T("app store connect: a failure with a body that is not an error document keeps the short message", notJson === "App Store Connect GET /v1/betaGroups failed (HTTP 502)")
  const shapeless = await rejects(apiClient(() => "token", async () => Response.json({ errors: [] })).getAll("/v1/betaGroups"))
  T("app store connect: a page without a data array is refused", shapeless === "Invalid App Store Connect response for /v1/betaGroups")

  const emptyPage = { data: [{ type: "betaTesters", id: "tester-1" }], links: { self: "https://api.appstoreconnect.apple.com/v1/betaGroups/group-1/betaTesters" } }
  let retryTokens = 0
  const recovered = scripted([500, 200], emptyPage)
  const recoveredTesters = await apiClient(() => `token-${++retryTokens}`, recovered.request, recovered.wait).getAll("/v1/betaGroups/group-1/betaTesters")
  T("app store connect: a GET that gets a 500 and then a 200 passes after one wait, with a new token and deadline on each attempt", recoveredTesters.map(({ id }) => id).join() === "tester-1" &&
    recovered.calls.length === 2 && recovered.waits.join() === "1000" && recovered.calls.map((call) => call.headers.Authorization).join() === "Bearer token-1,Bearer token-2" &&
    recovered.calls[0].signal !== recovered.calls[1].signal)

  for (const status of [500, 502, 503, 504, 429]) {
    const down = scripted([status, status, status, status, status], emptyPage)
    const message = await rejects(apiClient(() => "token", down.request, down.wait).getAll("/v1/betaGroups/group-1/betaTesters"))
    T(`app store connect: a GET that gets a ${status} on each attempt stops at the attempt limit with the unchanged message`,
      message === `App Store Connect GET /v1/betaGroups/group-1/betaTesters failed (HTTP ${status}): UNEXPECTED_ERROR "An unexpected error occurred."` &&
      down.calls.length === 4 && down.waits.join() === RETRY_WAITS, `${down.calls.length} calls, waits ${down.waits.join()}, message ${message}`)
  }

  for (const [label, call] of [["GET", (client) => client.getAll("/v1/betaGroups")], ["POST", (client) => client.post("/v1/betaTesters", createRequest)]]) {
    const refused = scripted([400, 200], emptyPage)
    const message = await rejects(call(apiClient(() => "token", refused.request, refused.wait)))
    T(`app store connect: a ${label} that gets a 400 fails on the first attempt`, message?.includes("failed (HTTP 400)") === true && refused.calls.length === 1 && refused.waits.length === 0,
      `${refused.calls.length} calls, message ${message}`)
  }

  const secondPage = recording((url) => {
    if (url.searchParams.has("cursor") && secondPage.calls.length === 2) return new Response("{}", { status: 503 })
    return Response.json({ data: [{ type: "betaGroups", id: url.searchParams.get("cursor") ?? "first" }], links: { self: String(url), ...(url.searchParams.has("cursor") ? {} : { next: "/v1/betaGroups?cursor=second" }) } })
  })
  const bothPages = await apiClient(() => "token", secondPage.request, async () => {}).getAll("/v1/betaGroups")
  T("app store connect: a 503 on a later page repeats that page only", bothPages.map(({ id }) => id).join() === "first,second" &&
    secondPage.calls.map((call) => call.url.search).join() === ",?cursor=second,?cursor=second")

  // The API reference documents no repeat-safe POST after a server error: the first POST can have created the resource.
  // A 429 is different: "the API rejects requests with an HTTP 429 response" (Identifying Rate Limits).
  for (const status of [500, 502, 503, 504]) {
    const uncertain = scripted([status, 201], createdTester)
    const message = await rejects(apiClient(() => "token", uncertain.request, uncertain.wait).post("/v1/betaTesters", createRequest))
    T(`app store connect: a POST that gets a ${status} has one attempt, because the first request can have created the record`,
      message === `App Store Connect POST /v1/betaTesters failed (HTTP ${status}): UNEXPECTED_ERROR "An unexpected error occurred."` && uncertain.calls.length === 1 && uncertain.waits.length === 0,
      `${uncertain.calls.length} calls, message ${message}`)
  }
  const limited = scripted([429, 201], createdTester)
  const limitedAnswer = await apiClient(() => "token", limited.request, limited.wait).post("/v1/betaTesters", createRequest)
  T("app store connect: a POST that Apple refused with a 429 is sent again with the same body", isDeepStrictEqual(limitedAnswer, createdTester) && limited.waits.join() === "1000" &&
    limited.calls.length === 2 && limited.calls.every((call) => call.method === "POST" && call.body === JSON.stringify(createRequest)))
  const alwaysLimited = scripted([429, 429, 429, 429, 429], createdTester)
  const limitedMessage = await rejects(apiClient(() => "token", alwaysLimited.request, alwaysLimited.wait).post("/v1/betaTesters", createRequest))
  T("app store connect: a POST that gets a 429 on each attempt stops at the attempt limit", limitedMessage?.includes("POST /v1/betaTesters failed (HTTP 429)") === true &&
    alwaysLimited.calls.length === 4 && alwaysLimited.waits.join() === RETRY_WAITS)
}
