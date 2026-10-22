import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { API } from '@orbit/shared/api'

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), fetch: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: async () => new Headers(),
}))

function jwt(expiresInSeconds: number) {
  return `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString('base64url')}.signature`
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function requestCookies(refreshToken = 'shared-refresh') {
  const values = new Map([['auth_token', jwt(-60)], ['refresh_token', refreshToken]])
  return {
    get: (name: string) => values.has(name) ? { value: values.get(name) } : undefined,
    set: vi.fn((name: string, value: string) => { values.set(name, value) }),
  }
}

const requestContext = new AsyncLocalStorage<{
  cookies: ReturnType<typeof requestCookies>
  beforeRead?: Promise<void>
}>()

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('orbitSessionRefreshRequests', new Map())
  mocks.fetch.mockReset()
  mocks.cookies.mockReset().mockImplementation(async () => {
    const context = requestContext.getStore()!
    await context.beforeRead
    return context.cookies
  })
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('real BFF refresh coordination', () => {
  it.each(['same module', 'separate modules', 'delayed cookie read'])(
    'keeps two expired authenticated requests signed in with %s', async (mode) => {
      const firstHandler = (await import('@/app/api/[...path]/route')).GET
      if (mode === 'separate modules') vi.resetModules()
      const secondHandler = (await import('@/app/api/[...path]/route')).GET
      const rotation = deferred<void>()
      const delayedRead = deferred<void>()
      const freshToken = jwt(3600)
      let currentRefresh = 'shared-refresh'
      const refreshAttempts: string[] = []
      mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
        if (url.endsWith(API.auth.refresh)) {
          const { refreshToken } = JSON.parse(init.body as string) as { refreshToken: string }
          refreshAttempts.push(refreshToken)
          if (refreshToken !== currentRefresh) return new Response(null, { status: 401 })
          currentRefresh = 'rotated-refresh'
          await rotation.promise
          return Response.json({ token: freshToken, refreshToken: currentRefresh })
        }
        return new Headers(init.headers).get('Authorization') === `Bearer ${freshToken}`
          ? Response.json({ accepted: true })
          : new Response(null, { status: 401 })
      })
      const firstCookies = requestCookies()
      const secondCookies = requestCookies()
      const invoke = (handler: typeof firstHandler) => handler(
        new NextRequest('https://app.example.com/api/config'),
        { params: Promise.resolve({ path: ['config'] }) },
      )
      const first = requestContext.run({ cookies: firstCookies }, () => invoke(firstHandler))
      await vi.waitFor(() => expect(refreshAttempts).toHaveLength(1))
      const second = requestContext.run({
        cookies: secondCookies,
        beforeRead: mode === 'delayed cookie read' ? delayedRead.promise : undefined,
      }, () => invoke(secondHandler))
      await new Promise((resolve) => setTimeout(resolve, 0))
      rotation.resolve()
      await first
      delayedRead.resolve()
      const responses = await Promise.all([first, second])

      expect(responses.map((response) => response.status)).toEqual([200, 200])
      expect(refreshAttempts).toEqual(['shared-refresh'])
      for (const cookies of [firstCookies, secondCookies]) {
        expect(cookies.set).toHaveBeenCalledWith('auth_token', freshToken, expect.any(Object))
        expect(cookies.set).toHaveBeenCalledWith('refresh_token', 'rotated-refresh', expect.any(Object))
      }
    },
  )

  it('rejects a consumed token again after the overlap window', async () => {
    vi.useFakeTimers()
    const { GET } = await import('@/app/api/[...path]/route')
    const freshToken = jwt(3600)
    mocks.fetch.mockImplementation(async (url: string) => {
      if (!url.endsWith(API.auth.refresh)) return Response.json({ accepted: true })
      const attempts = mocks.fetch.mock.calls.filter(([path]) => path.endsWith(API.auth.refresh))
      return attempts.length === 1
        ? Response.json({ token: freshToken, refreshToken: 'rotated-refresh' })
        : new Response(null, { status: 401 })
    })
    const invoke = () => requestContext.run({ cookies: requestCookies() }, () => GET(
      new NextRequest('https://app.example.com/api/config'),
      { params: Promise.resolve({ path: ['config'] }) },
    ))

    expect((await invoke()).status).toBe(200)
    expect((await invoke()).status).toBe(200)
    await vi.advanceTimersByTimeAsync(5_000)
    const rejected = await invoke()

    expect(rejected.status).toBe(401)
    expect(rejected.headers.get('x-orbit-session-refresh')).toBe('failed')
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith(API.auth.refresh))).toHaveLength(2)
  })

  it('keeps different sessions independent', async () => {
    const { GET } = await import('@/app/api/[...path]/route')
    const freshToken = jwt(3600)
    mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (!url.endsWith(API.auth.refresh)) return Response.json({ accepted: true })
      const { refreshToken } = JSON.parse(init.body as string) as { refreshToken: string }
      return Response.json({ token: freshToken, refreshToken: `${refreshToken}-rotated` })
    })
    const requests = ['session-a', 'session-b'].map((refreshToken) => {
      const cookies = requestCookies(refreshToken)
      return requestContext.run({ cookies }, async () => {
        const response = await GET(new NextRequest('https://app.example.com/api/config'), {
          params: Promise.resolve({ path: ['config'] }),
        })
        expect(response.status).toBe(200)
        expect(cookies.set).toHaveBeenCalledWith('refresh_token', `${refreshToken}-rotated`, expect.any(Object))
      })
    })
    await Promise.all(requests)
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith(API.auth.refresh))).toHaveLength(2)
  })
})
