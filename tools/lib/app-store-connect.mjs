const API_ORIGIN = "https://api.appstoreconnect.apple.com"

const ADDRESS_PATTERN = /[^\s@"'<>]+@[^\s@"'<>]+/g

const errorSummary = async (response) => {
  const body = await response.json().catch(() => null)
  const { code, title } = body?.errors?.[0] ?? {}
  if (typeof code !== "string" || typeof title !== "string") return ""
  return `: ${code} "${title}"`.replace(ADDRESS_PATTERN, "[address]")
}

/**
 * The one App Store Connect API transport: a fresh bearer token per request (each token lives 10 minutes),
 * a 30-second limit, GET with pagination and JSON POST. A pagination link must keep the API host and the
 * first path, and is read once, so the token never goes to another host. A failure names the method, path,
 * status and the first error's code and title. The detail is never read: Apple repeats a person's address there.
 */
export const apiClient = (createToken, request = fetch) => {
  const send = async (url, options) => {
    const response = await request(url, {
      ...options,
      headers: { Authorization: `Bearer ${createToken()}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`App Store Connect ${options.method} ${new URL(url).pathname} failed (HTTP ${response.status})${await errorSummary(response)}`)
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
  const post = async (path, body) => (await send(new URL(path, API_ORIGIN), { method: "POST", body: JSON.stringify(body) })).json()
  return { getAll, post }
}
