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
  apiClient: vi.fn(),
  syncWidgetData: vi.fn(),
  refreshPersistentReminder: vi.fn(),
}))

vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/persistent-reminder', () => ({
  refreshPersistentReminder: mocks.refreshPersistentReminder,
}))

const OPAQUE_HEX = /^#[0-9a-fA-F]{6}$/
const colorSchemes = Object.keys(schemes) as ColorScheme[]
const modes: ThemeMode[] = ['dark', 'light']

describe('syncWidgetData', () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue('account-a-token')
    mocks.apiClient.mockReset().mockResolvedValue({ habits: [] })
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
  })

  it('passes the fetching account token to the native cache after an account change', async () => {
    const payload = { habits: [] }
    mocks.apiClient.mockImplementation(async () => {
      await Promise.resolve()
      mocks.getToken.mockResolvedValue('account-b-token')
      return payload
    })

    await syncWidgetData()

    expect(mocks.apiClient).toHaveBeenCalledWith(API.habits.widget)
    expect(mocks.syncWidgetData).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify(payload), 'account-a-token',
    )
    expect(mocks.refreshPersistentReminder).toHaveBeenCalledWith(payload)
  })

  it('does not send a payload to the native cache when signed out', async () => {
    mocks.getToken.mockResolvedValue(null)

    await syncWidgetData()

    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
    expect(mocks.refreshPersistentReminder).toHaveBeenCalledWith(null)
  })

  it('does not write the native cache when the fetch fails', async () => {
    const failure = new Error('Widget fetch failed')
    mocks.apiClient.mockRejectedValue(failure)

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
