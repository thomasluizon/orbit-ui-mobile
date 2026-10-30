import http from 'node:http'
import https from 'node:https'
import { afterEach, expect, it, vi } from 'vitest'
import { installNetworkGuard } from '@orbit/shared/test-support/network-guard'

let guard: ReturnType<typeof installNetworkGuard> | undefined
const originalFetch = globalThis.fetch

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
