import { setTimeout as wait } from "node:timers/promises"

import { runBounded } from "./bounded-process.mjs"

const ceiling = () => Object.assign(new Error("GitHub read ceiling reached"), { code: "GITHUB_READ_CEILING" })

const responseParts = (stdout) => {
  const match = /^HTTP\/\S+ (\d{3})[^\n]*\r?\n((?:[^\r\n]+\r?\n)*)\r?\n/.exec(stdout)
  if (!match) return { status: null, headers: new Map(), body: stdout }
  const headers = new Map(match[2].trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf(":")
    return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()]
  }))
  return { status: Number(match[1]), headers, body: stdout.slice(match[0].length) }
}

const retryAfter = (headers) => {
  const value = headers.get("retry-after")
  if (value === undefined) return null
  if (/^\d+$/.test(value)) return Number(value) * 1000
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null
}

const attempt = async (args, environment, options) => {
  options.signal.throwIfAborted()
  if (Date.now() >= options.deadline) throw ceiling()
  const rest = args[0] === "api" ? options.rest : null
  const cached = rest?.cache?.get(args[1])
  const reservation = await rest?.beforeRequest?.(options)
  options.signal.throwIfAborted()
  if (Date.now() >= options.deadline) throw ceiling()
  if (cached?.etag) args = [...args, "--header", `If-None-Match: ${cached.etag}`]
  const result = await runBounded(environment.GH_BIN || "gh", args, {
    env: environment, timeoutMs: Math.min(30000, options.deadline - Date.now()), maxBuffer: 8 * 1024 * 1024,
    signal: options.signal,
  })
  options.signal.throwIfAborted()
  const response = responseParts(result.stdout)
  await rest?.afterResponse?.(response, reservation, options)
  // gh exits 1 for a successful conditional read with an empty 304 body.
  if (!result.error && !result.timedOut && !result.overflowed && response.status === 304) {
    if (!cached) throw new Error("GitHub returned 304 without a cached response")
    return cached.body
  }
  if (result.timedOut || result.error || result.overflowed || result.status !== 0) {
    const text = result.stderr || result.error?.message || (result.timedOut ? "gh timed out" : response.body || `exit ${result.status}`)
    const status = response.status ?? Number(/\bHTTP (\d{3})\b/.exec(text)?.[1])
    const secondaryLimit = /secondary rate limit|abuse detection/i.test(text)
    const rateLimited = status === 403 && (response.headers.has("retry-after") ||
      response.headers.get("x-ratelimit-remaining") === "0" || secondaryLimit) || (!status && secondaryLimit)
    const timeout = result.timedOut || /timed?\s*out|context deadline exceeded|Client\.Timeout/i.test(text)
    const transient = !result.error && !result.overflowed && (status >= 500 && status <= 599 ||
      status === 429 || rateLimited || (!(status >= 400 && status <= 499) && timeout))
    const error = Object.assign(new Error(`GitHub read ${args.join(" ")} failed: ${text}`), {
      transient, retryAfterMs: retryAfter(response.headers), fallbackAllowed: transient && !rateLimited && status !== 429,
    })
    if (transient) options.onTransientError(error.message)
    throw error
  }
  try {
    const body = JSON.parse(response.body)
    if (rest?.cache && response.headers.has("etag")) rest.cache.set(args[1], { etag: response.headers.get("etag"), body })
    return body
  } catch (error) {
    throw new Error(`GitHub read ${args.join(" ")} returned invalid JSON: ${error.message}`)
  }
}

const pause = async (milliseconds, { deadline, signal }) => {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw ceiling()
  await wait(Math.min(milliseconds, remaining), undefined, { signal })
  if (Date.now() >= deadline) throw ceiling()
}

const retryRead = async (operation, options) => {
  const controller = new AbortController()
  const settings = { deadline: Date.now() + 60000, pollMs: 1000, onTransientError: () => {}, ...options, signal: controller.signal }
  const abort = () => controller.abort()
  const handlers = [["SIGINT", 130], ["SIGTERM", 143]].map(([signal, code]) => {
    const handler = () => {
      abort()
      // Cleanup must precede caller handlers, which may exit synchronously and remove a wake.
      if (process.listenerCount(signal) === 0) process.exit(code)
    }
    process.prependOnceListener(signal, handler)
    return [signal, handler]
  })
  process.once("exit", abort)
  let failures = 0
  try {
    while (true) {
      try { return await operation(settings) } catch (error) {
        if (!error.transient) throw error
        const backoff = Math.min(settings.pollMs, 1000 * 2 ** Math.min(failures++, 10))
        await pause(error.retryAfterMs ?? backoff, settings)
      }
    }
  } finally {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler)
    process.removeListener("exit", abort)
  }
}

/** Admission retries are bounded per read; waiters supply their shared wall-clock ceiling. */
export const readGithub = (path, environment, options = {}) =>
  retryRead((settings) => attempt(["api", path, "--include"], environment, settings), options)

export const readGithubPull = (slug, number, environment, options = {}) => retryRead(async (settings) => {
  try {
    return await attempt(["api", `repos/${slug}/pulls/${number}`, "--include"], environment, settings)
  } catch (error) {
    if (!error.fallbackAllowed) throw error
    if (error.retryAfterMs !== null) await pause(error.retryAfterMs, settings)
    // Tracks #1640: GitHub can serve GraphQL while the single-pull REST endpoint is unavailable.
    const pull = await attempt(["pr", "view", String(number), "--repo", slug, "--json", "state,headRefOid"], environment, settings)
    if (typeof pull?.headRefOid !== "string" || !["OPEN", "CLOSED", "MERGED"].includes(pull.state)) {
      throw new Error(`GitHub pull request #${number} GraphQL read had an unexpected shape`)
    }
    return { state: pull.state === "OPEN" ? "open" : "closed", head: { sha: pull.headRefOid } }
  }
}, options)
