import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { installNetworkGuard } from '@orbit/shared/test-support/network-guard'

let guard: ReturnType<typeof installNetworkGuard> | undefined
const originalFetch = globalThis.fetch
const blockedRedirect = new URL('http://127.0.0.1/api/profile')
blockedRedirect.hostname = 'api.example.invalid'

async function fixtureServer(handler: http.RequestListener) {
  const server = http.createServer(handler)
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP fixture server')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => { if (error) reject(error); else resolve() })
      server.closeAllConnections()
    }),
  }
}

afterEach(() => {
  guard?.restore()
  vi.unstubAllGlobals()
  globalThis.fetch = originalFetch
})

it('fails verification even when the caller catches an unmocked fetch rejection', async () => {
  guard = installNetworkGuard()
  await expect(fetch('https://api.example.test/api/profile')).rejects.toThrow('GET https://api.example.test/api/profile')
  expect(guard.verify).toThrow('Unmocked network request: GET https://api.example.test/api/profile')
  expect(guard.verify).not.toThrow()
})

it('reports a Request method and its explicit override', async () => {
  guard = installNetworkGuard()
  const request = new Request('https://api.example.test/api/habits', { method: 'POST' })
  await expect(fetch(request)).rejects.toThrow('POST https://api.example.test/api/habits')
  await expect(fetch(request, { method: 'DELETE' })).rejects.toThrow('DELETE https://api.example.test/api/habits')
  expect(guard.verify).toThrow('POST https://api.example.test/api/habits\nUnmocked network request: DELETE')
})

it.each([http, https])('blocks Node request and get before opening a socket', (transport) => {
  guard = installNetworkGuard()
  expect(() => transport.request('https://api.example.test/api/profile', { method: 'POST' })).toThrow('POST https://api.example.test/api/profile')
  expect(() => transport.get({ hostname: 'api.example.test', path: '/api/habits' })).toThrow('GET')
  expect(guard.verify).toThrow('api.example.test/api/habits')
})

it('checks Node hostname overrides before allowing a loopback URL', () => {
  guard = installNetworkGuard()
  expect(() => http.get('http://127.0.0.1/api/habits', { hostname: 'api.example.test' })).toThrow('GET http://api.example.test/api/habits')
  expect(guard.verify).toThrow('api.example.test')
})

it.each(['http://127.0.0.1:1234', 'http://localhost:1234', 'http://[::1]:1234'])('allows loopback fixture requests to %s', async (origin) => {
  const response = Response.json({ fixture: true })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  guard = installNetworkGuard()
  await expect(fetch(`${origin}/api/habits`)).resolves.toBe(response)
  expect(guard.verify).not.toThrow()
})

it('lets a test install its own fetch mock', async () => {
  guard = installNetworkGuard()
  const response = Response.json({ mocked: true })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(fetch('https://api.example.test/api/habits')).resolves.toBe(response)
  expect(guard.verify).not.toThrow()
})

it('allows embedded data resources without opening a network connection', async () => {
  guard = installNetworkGuard()
  const response = await fetch('data:text/plain,embedded-fixture')
  await expect(response.text()).resolves.toBe('embedded-fixture')
  expect(guard.verify).not.toThrow()
})

it('records a blocked redirect hop even when fetch rejects and the caller catches it', async () => {
  const redirector = await fixtureServer((_, response) => {
    response.writeHead(302, { Location: blockedRedirect.href }).end()
  })
  try {
    guard = installNetworkGuard()
    await expect(fetch(redirector.origin)).rejects.toThrow()
    expect(guard.verify).toThrow(`Unmocked network request: GET ${blockedRedirect.href}`)
    await expect(fetch(redirector.origin)).rejects.toThrow(`Unmocked network request: GET ${blockedRedirect.href}`)
    expect(guard.verify).toThrow(`Unmocked network request: GET ${blockedRedirect.href}`)
  } finally {
    await redirector.close()
  }
})

it('follows permitted redirect hops between loopback fixture servers', async () => {
  const destination = await fixtureServer((_, response) => { response.end('loopback fixture') })
  const redirector = await fixtureServer((_, response) => {
    response.writeHead(302, { Location: `${destination.origin}/fixture` }).end()
  })
  try {
    guard = installNetworkGuard()
    const response = await fetch(redirector.origin)
    await expect(response.text()).resolves.toBe('loopback fixture')
    expect(guard.verify).not.toThrow()
  } finally {
    await Promise.all([redirector.close(), destination.close()])
  }
})

it('preserves a caller-supplied manual redirect mode', async () => {
  const redirector = await fixtureServer((_, response) => {
    response.writeHead(302, { Location: blockedRedirect.href }).end()
  })
  try {
    guard = installNetworkGuard()
    const response = await fetch(redirector.origin, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(blockedRedirect.href)
    await response.body?.cancel()
    expect(guard.verify).not.toThrow()
  } finally {
    await redirector.close()
  }
})

it.each([
  [301, 'POST', 'GET'], [302, 'POST', 'GET'], [303, 'PUT', 'GET'],
  [303, 'HEAD', 'HEAD'], [301, 'PUT', 'PUT'], [307, 'POST', 'POST'], [308, 'POST', 'POST'],
])('preserves redirect method and body rules for %s %s', async (status, method, expectedMethod) => {
  const received = vi.fn()
  const destination = await fixtureServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      received(request.method, Buffer.concat(chunks).toString(), request.headers['content-type'], request.headers.authorization)
      response.end()
    })
  })
  const redirector = await fixtureServer((request, response) => {
    if (request.url === '/start') response.writeHead(Number(status), { Location: '/next' }).end()
    else response.writeHead(Number(status), { Location: destination.origin }).end()
  })
  try {
    guard = installNetworkGuard()
    const hasBody = method !== 'HEAD'
    const response = await fetch(new Request(`${redirector.origin}/start`, {
      method: String(method),
      body: hasBody ? 'fixture payload' : undefined,
      headers: { ...(hasBody ? { 'content-type': 'text/plain' } : {}), authorization: 'fixture-token' },
      redirect: 'follow',
    }))
    await response.arrayBuffer()
    const keptBody = expectedMethod !== 'GET' && hasBody
    expect(received).toHaveBeenCalledExactlyOnceWith(expectedMethod, keptBody ? 'fixture payload' : '', keptBody ? 'text/plain' : undefined, undefined)
    expect(guard.verify).not.toThrow()
  } finally {
    await Promise.all([redirector.close(), destination.close()])
  }
})
