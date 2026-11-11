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

  let tokens = 0
  const signed = recording((url) => Response.json({ data: [], links: { self: String(url) } }))
  const client = apiClient(() => `token-${++tokens}`, signed.request)
  await client.getAll("/v1/betaGroups")
  await client.post("/v1/betaGroups", { data: {} })
  T("app store connect: each request signs its own token", tokens === 2 && signed.calls.map((call) => call.headers.Authorization).join() === "Bearer token-1,Bearer token-2")

  const linked = recording(() => new Response(null, { status: 204 }))
  const answer = await apiClient(() => "token", linked.request).post("/v1/betaGroups/group-1/relationships/betaTesters", { data: [{ type: "betaTesters", id: "tester-a" }] })
  const [linkCall] = linked.calls
  T("app store connect: a POST sends JSON with its content type and a 204 answer returns null", answer === null && linkCall.method === "POST" &&
    linkCall.url.href === "https://api.appstoreconnect.apple.com/v1/betaGroups/group-1/relationships/betaTesters" &&
    linkCall.headers["Content-Type"] === "application/json" && JSON.parse(linkCall.body).data[0].id === "tester-a")

  const denied = await rejects(apiClient(() => "token", async () => new Response("{}", { status: 403 })).getAll("/v1/betaGroups"))
  T("app store connect: an HTTP failure names the method, the path and the status", denied === "App Store Connect GET /v1/betaGroups failed (HTTP 403)")
  const detailed = await rejects(apiClient(() => "token", async () => Response.json({ errors: [{ id: "e1", status: "409", code: "STATE_ERROR", title: "The request cannot be fulfilled because of the state of another resource.", detail: "Tester(s) cannot be assigned: person@example.test" }] }, { status: 409 })).post("/v1/betaTesters", {}))
  T("app store connect: a failure adds the first error's code and title and never the detail", detailed === 'App Store Connect POST /v1/betaTesters failed (HTTP 409): STATE_ERROR "The request cannot be fulfilled because of the state of another resource."')
  const addressed = await rejects(apiClient(() => "token", async () => Response.json({ errors: [{ status: "409", code: "ENTITY_ERROR", title: "Tester person@example.test exists", detail: "x" }] }, { status: 409 })).post("/v1/betaTesters", {}))
  T("app store connect: an e-mail address inside an error title is replaced", addressed === 'App Store Connect POST /v1/betaTesters failed (HTTP 409): ENTITY_ERROR "Tester [address] exists"')
  const notJson = await rejects(apiClient(() => "token", async () => new Response("<html>bad gateway</html>", { status: 502 })).getAll("/v1/betaGroups"))
  T("app store connect: a failure with a body that is not an error document keeps the short message", notJson === "App Store Connect GET /v1/betaGroups failed (HTTP 502)")
  const shapeless = await rejects(apiClient(() => "token", async () => Response.json({ errors: [] })).getAll("/v1/betaGroups"))
  T("app store connect: a page without a data array is refused", shapeless === "Invalid App Store Connect response for /v1/betaGroups")
}
