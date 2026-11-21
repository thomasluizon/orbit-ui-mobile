import { sign } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

const API_ORIGIN = "https://api.appstoreconnect.apple.com"

/** Signs the short-lived ES256 token the App Store Connect API requires for a team key. */
export const appStoreToken = ({ keyId, issuerId, privateKey }) => {
  if (!keyId || !issuerId || !privateKey) throw new Error("App Store Connect API credentials unavailable")
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const issuedAt = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuerId, iat: issuedAt, exp: issuedAt + 600, aud: "appstoreconnect-v1" })}`
  const signature = sign("SHA256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")
  return `${unsigned}.${signature}`
}

// The waits before the second, third and fourth attempt of one request. Their count sets the attempt limit.
const RETRY_WAITS_MS = [1_000, 4_000, 16_000]

// A GET changes nothing, so a server error or a rate limit answer is safe to send again. The API reference documents
// no repeat-safe POST after a server error: the first POST can have created the resource. It does document that the
// API rejects a request with a 429 (Identifying Rate Limits), so only that status sends a POST again.
const RETRY_STATUSES = { GET: new Set([429, 500, 502, 503, 504]), POST: new Set([429]) }

const ADDRESS_PATTERN = /[^\s@"'<>]+@[^\s@"'<>]+/g

const errorSummary = async (response) => {
  const body = await response.json().catch(() => null)
  const { code, title } = body?.errors?.[0] ?? {}
  if (typeof code !== "string" || typeof title !== "string") return ""
  return `: ${code} "${title}"`.replace(ADDRESS_PATTERN, "[address]")
}

/**
 * The one App Store Connect API transport: GET with pagination and JSON POST. Each attempt has a fresh bearer token
 * (a token lives 10 minutes) and a 30-second limit; a transient answer gets the next attempt after a wait. A pagination
 * link must keep the API host and the first path, and is read once, so the token never goes to another host. A failure
 * names the method, path, status and the first error's code and title; the detail can hold a person's address.
 */
export const apiClient = (createToken, request = fetch, wait = delay) => {
  const send = async (url, options) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await request(url, {
        ...options,
        headers: { Authorization: `Bearer ${createToken()}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
        signal: AbortSignal.timeout(30_000),
      })
      if (response.ok) return response
      if (attempt === RETRY_WAITS_MS.length || !RETRY_STATUSES[options.method].has(response.status)) {
        throw new Error(`App Store Connect ${options.method} ${new URL(url).pathname} failed (HTTP ${response.status})${await errorSummary(response)}`)
      }
      await response.body?.cancel()
      await wait(RETRY_WAITS_MS[attempt])
    }
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
  const post = async (path, body) => (await send(new URL(path, API_ORIGIN), { method: "POST", body: JSON.stringify(body) })).json()
  return { getAll, post }
}
