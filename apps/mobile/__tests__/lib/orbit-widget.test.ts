import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { schemes } from '@orbit/shared/theme'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { createTokensV2 } from '@/lib/theme'
import { syncWidgetData, toWidgetColors } from '@/lib/orbit-widget'

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  refreshSession: vi.fn(),
  syncWidgetData: vi.fn(),
  refreshPersistentReminder: vi.fn(),
}))

vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/stores/auth-store', () => ({
  getSessionGeneration: () => ({ epoch: 1, credentialVersion: 0 }),
  refreshSession: mocks.refreshSession,
}))
vi.mock('@/lib/persistent-reminder', () => ({
  refreshPersistentReminder: mocks.refreshPersistentReminder,
}))

const OPAQUE_HEX = /^#[0-9a-fA-F]{6}$/
const colorSchemes = Object.keys(schemes) as ColorScheme[]
const modes: ThemeMode[] = ['dark', 'light']

describe('syncWidgetData', () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue('account-a-token')
    mocks.fetch.mockReset().mockRejectedValue(new Error('Unexpected widget request'))
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.refreshSession.mockReset()
    mocks.syncWidgetData.mockReset().mockResolvedValue(undefined)
    mocks.refreshPersistentReminder.mockReset().mockResolvedValue(undefined)
    const loader = Module as typeof Module & { _load: (id: string, ...args: unknown[]) => unknown }
    const originalLoad = loader._load
    vi.spyOn(loader, '_load').mockImplementation((id, ...args) => {
      if (id === '../modules/orbit-widget') {
        return { default: { syncWidgetData: mocks.syncWidgetData } }
      }
      return originalLoad(id, ...args)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('pairs B payload with B credential when storage changes before request execution', async () => {
    const payload = { habits: [{ id: 'account-b-habit' }] }
    mocks.getToken.mockImplementationOnce(() => {
      mocks.getToken.mockResolvedValue('account-b-token')
      return Promise.resolve('account-a-token')
    })
    mocks.fetch.mockImplementation((url, options) => {
      expect(url).toContain(API.habits.widget)
      expect(options?.headers).toMatchObject({ Authorization: 'Bearer account-b-token' })
      return Promise.resolve(new Response(JSON.stringify(payload)))
    })

    await syncWidgetData()

    expect(mocks.syncWidgetData).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(payload), 'account-b-token',
    )
    expect(mocks.refreshPersistentReminder).toHaveBeenCalledWith(payload)
  })

  it.each(['account-b-token', 'account-a-token'])(
    'pairs a successful B retry with B credential when %s is active at handoff', async (activeToken) => {
      const payload = { habits: [{ id: 'account-b-habit' }] }
      mocks.fetch.mockImplementation((_url, options) => {
        const authorization = new Headers(options?.headers).get('Authorization')
        if (authorization === 'Bearer account-a-token') {
          mocks.getToken.mockResolvedValue('account-b-token')
          return Promise.resolve(new Response(null, { status: 401 }))
        }
        expect(authorization).toBe('Bearer account-b-token')
        mocks.getToken.mockResolvedValue(activeToken)
        return Promise.resolve(new Response(JSON.stringify(payload)))
      })

      await syncWidgetData()

      expect(mocks.fetch).toHaveBeenCalledTimes(2)
      expect(mocks.refreshSession).not.toHaveBeenCalled()
      expect(mocks.syncWidgetData).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify(payload), 'account-b-token',
      )
    },
  )

  it('keeps A ownership when an A-authorized response arrives after switching to B', async () => {
    const payload = { habits: [{ id: 'account-a-habit' }] }
    mocks.fetch.mockImplementation((_url, options) => {
      expect(options?.headers).toMatchObject({ Authorization: 'Bearer account-a-token' })
      mocks.getToken.mockResolvedValue('account-b-token')
      return Promise.resolve(new Response(JSON.stringify(payload)))
    })

    await syncWidgetData()

    expect(mocks.syncWidgetData).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(payload), 'account-a-token',
    )
    expect(mocks.refreshPersistentReminder).toHaveBeenCalledWith(payload)
  })

  it('does not send a payload to the native cache when signed out', async () => {
    mocks.getToken.mockResolvedValue(null)

    await syncWidgetData()

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
    expect(mocks.refreshPersistentReminder).toHaveBeenCalledWith(null)
  })

  it('does not hand off an anonymously fetched payload after the credential disappears', async () => {
    mocks.getToken.mockResolvedValueOnce('account-a-token').mockResolvedValue(null)
    mocks.fetch.mockImplementation((_url, options) => {
      expect(new Headers(options?.headers).has('Authorization')).toBe(false)
      return Promise.resolve(new Response(JSON.stringify({ habits: [] })))
    })

    await syncWidgetData()

    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
  })

  it('does not write the native cache when the fetch fails', async () => {
    const failure = new Error('Widget fetch failed')
    mocks.fetch.mockRejectedValue(failure)

    await expect(syncWidgetData()).rejects.toThrow(failure)

    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
    expect(mocks.refreshPersistentReminder).not.toHaveBeenCalled()
  })
})

describe('native widget cache ownership', () => {
  it('rejects tokenless cache writes and still refreshes widgets', () => {
    const source = readFileSync(resolve(
      import.meta.dirname,
      '../../modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/OrbitWidgetModule.kt',
    ), 'utf8')
    const nativeSync = source.slice(
      source.indexOf('AsyncFunction("syncWidgetData")'),
      source.indexOf('OnActivityEntersBackground'),
    )

    expect(nativeSync).not.toMatch(/token\s*\?:\s*getToken\(context\)/)
    expect(nativeSync).toMatch(/if \(token != null\) \{\s*val session = sessionKey\(token\)/)
    expect(nativeSync).toMatch(/if \(getToken\(context\)\?\.let \{ sessionKey\(it\) \} == session\) \{\s*context\.getSharedPreferences/)
    expect(nativeSync).toMatch(/\n      \}\n      refreshWidgets\(context\)/)
  })
})

describe('toWidgetColors', () => {
  it('returns defined, non-empty colors for every scheme and mode', () => {
    for (const scheme of colorSchemes) {
      for (const mode of modes) {
        const colors = toWidgetColors(createTokensV2(scheme, mode))
        for (const [key, value] of Object.entries(colors)) {
          expect(value, `${scheme}/${mode}:${key}`).toBeTruthy()
          expect(typeof value, `${scheme}/${mode}:${key}`).toBe('string')
        }
      }
    }
  })

  it('flattens alpha surfaces to fully opaque hex (widget RemoteViews cannot blend transparency)', () => {
    const flattened = ['surface', 'surfaceGround', 'border', 'borderMuted', 'statusEmpty'] as const
    for (const scheme of colorSchemes) {
      for (const mode of modes) {
        const colors = toWidgetColors(createTokensV2(scheme, mode))
        for (const key of flattened) {
          expect(colors[key], `${scheme}/${mode}:${key}`).toMatch(OPAQUE_HEX)
        }
      }
    }
  })

  it('keeps text legible against the widget background (no contrast collapse)', () => {
    for (const scheme of colorSchemes) {
      for (const mode of modes) {
        const colors = toWidgetColors(createTokensV2(scheme, mode))
        expect(colors.textPrimary, `${scheme}/${mode}`).not.toBe(colors.background)
      }
    }
  })
})
