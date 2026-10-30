import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { afterAll, beforeEach, onTestFinished } from 'vitest'

function isLocalResource(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'data:' || (['http:', 'https:'].includes(parsed.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  } catch {
    return false
  }
}

function nodeRequestTarget(args: unknown[], protocol: string) {
  const [input, overrides] = args as [string | URL | http.RequestOptions, http.RequestOptions | undefined]
  const url = typeof input === 'string' || input instanceof URL ? new URL(input) : undefined
  const options = { ...(url ? {} : input as http.RequestOptions), ...(typeof overrides === 'object' ? overrides : {}) }
  const hostname = options.hostname ?? options.host ?? url?.hostname ?? 'localhost'
  const port = options.port ?? url?.port
  const path = options.path ?? (url ? `${url.pathname}${url.search}` : '/')
  return {
    method: options.method ?? 'GET',
    url: `${options.protocol ?? url?.protocol ?? protocol}//${hostname}${port ? `:${port}` : ''}${path}`,
  }
}

async function redirectRequest(request: Request, target: URL, method: string): Promise<Request> {
  const dropBody = method !== request.method
  const headers = new Headers(request.headers)
  if (dropBody) {
    for (const name of ['content-encoding', 'content-language', 'content-location', 'content-type', 'content-length']) headers.delete(name)
  }
  if (new URL(request.url).origin !== target.origin) {
    for (const name of ['authorization', 'proxy-authorization', 'cookie', 'host']) headers.delete(name)
  }
  const body = !dropBody && request.body ? await request.arrayBuffer() : null
  if (dropBody) await request.body?.cancel()
  return new Request(target.href, {
    method,
    headers, body,
    signal: request.signal,
    credentials: request.credentials,
    cache: request.cache,
    mode: request.mode,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
  })
}

async function fetchWithCheckedRedirects(
  originalFetch: typeof fetch,
  request: Request,
  check: (method: string, url: string) => void,
): Promise<Response> {
  try {
    for (let hops = 0; ; hops++) {
      const response = await originalFetch(request.clone(), { redirect: 'manual' })
      const location = response.headers.get('location')
      if (![301, 302, 303, 307, 308].includes(response.status) || location === null) return response
      await response.body?.cancel()
      const target = new URL(location, request.url)
      const method = ([301, 302].includes(response.status) && request.method === 'POST')
        || (response.status === 303 && !['GET', 'HEAD'].includes(request.method)) ? 'GET' : request.method
      check(method, target.href)
      if (hops === 20) throw new TypeError('Redirect count exceeded')
      request = await redirectRequest(request, target, method)
    }
  } finally {
    if (!request.bodyUsed) await request.body?.cancel()
  }
}

export function installNetworkGuard(): { verify: () => void; restore: () => void } {
  const requests: string[] = []
  const restorations: (() => void)[] = []
  function check(method: string, url: string) {
    if (isLocalResource(url)) return
    const message = `Unmocked network request: ${method} ${url}`
    requests.push(message)
    throw new Error(message)
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = new Proxy(originalFetch, {
    async apply(target, _receiver, [input, options]: [string | URL | Request, RequestInit?]) {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      const method = options?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
      check(method, url)
      const request = new Request(input instanceof URL ? input.href : input, options)
      return request.redirect === 'follow'
        ? fetchWithCheckedRedirects(target, request, check)
        : target(request)
    },
  })
  restorations.push(() => { globalThis.fetch = originalFetch })

  for (const [transport, protocol] of [[http, 'http:'], [https, 'https:']] as const) {
    for (const operation of ['request', 'get'] as const) {
      const original = transport[operation]
      transport[operation] = new Proxy(original, {
        apply(target, receiver, args: unknown[]) {
          const request = nodeRequestTarget(args, protocol)
          check(request.method, request.url)
          return Reflect.apply(target, receiver, args) as http.ClientRequest
        },
      })
      restorations.push(() => { transport[operation] = original })
    }
  }
  syncBuiltinESMExports()

  const xhr = (globalThis as { XMLHttpRequest?: { prototype: { open: (method: string, url: string | URL) => void } } }).XMLHttpRequest
  if (xhr) {
    const original = xhr.prototype.open
    xhr.prototype.open = new Proxy(original, {
      apply(target, receiver, args: [string, string | URL]) {
        check(args[0], String(args[1]))
        return Reflect.apply(target, receiver, args)
      },
    })
    restorations.push(() => { xhr.prototype.open = original })
  }

  return {
    verify() {
      const failures = requests.splice(0)
      if (failures.length) throw new Error(failures.join('\n'))
    },
    restore() {
      for (const restore of restorations.reverse()) restore()
      syncBuiltinESMExports()
    },
  }
}

export function guardTestNetwork(): void {
  const guard = installNetworkGuard()
  beforeEach(() => { onTestFinished(guard.verify) })
  afterAll(() => {
    guard.restore()
    guard.verify()
  })
}
