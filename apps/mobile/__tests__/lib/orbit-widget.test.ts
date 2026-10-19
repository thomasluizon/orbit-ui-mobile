import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { schemes } from '@orbit/shared/theme'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { createTokensV2 } from '@/lib/theme'
import { __setOrbitWidgetModuleForTests, syncWidgetData, toWidgetColors, toWidgetThemePreferences } from '@/lib/orbit-widget'

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  refreshSession: vi.fn(),
  syncWidgetData: vi.fn(),
}))

vi.mock('@/lib/secure-store', () => ({ getToken: mocks.getToken }))
vi.mock('@/lib/app-version', () => ({ buildAppVersionHeaders: () => ({}) }))
vi.mock('@/stores/auth-store', () => ({
  getSessionGeneration: () => ({ epoch: 1, credentialVersion: 0 }),
  refreshSession: mocks.refreshSession,
}))

const OPAQUE_HEX = /^#[0-9a-fA-F]{6}$/
const colorSchemes = Object.keys(schemes) as ColorScheme[]
const modes: ThemeMode[] = ['dark', 'light']

function readWidgetSource(relativePath: string) {
  return readFileSync(`modules/orbit-widget/android/src/main/${relativePath}`, 'utf8')
}

describe('syncWidgetData', () => {
  beforeEach(() => {
    mocks.getToken.mockReset().mockResolvedValue('account-a-token')
    mocks.fetch.mockReset().mockRejectedValue(new Error('Unexpected widget request'))
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.refreshSession.mockReset()
    mocks.syncWidgetData.mockReset().mockResolvedValue(undefined)
    __setOrbitWidgetModuleForTests({
      saveToken: vi.fn(), clearToken: vi.fn(), syncTheme: vi.fn(),
      syncWidgetData: mocks.syncWidgetData,
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
  })

  it('does not send a payload to the native cache when signed out', async () => {
    mocks.getToken.mockResolvedValue(null)

    await syncWidgetData()

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.syncWidgetData).not.toHaveBeenCalled()
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
  })
})

describe('toWidgetColors', () => {
  it('returns defined, non-empty colors for every scheme and mode', () => {
    for (const scheme of colorSchemes) {
      for (const mode of modes) {
        const colors = toWidgetColors(createTokensV2(scheme, mode), mode)
        for (const [key, value] of Object.entries(colors)) {
          expect(value, `${scheme}/${mode}:${key}`).toBeTruthy()
          expect(typeof value, `${scheme}/${mode}:${key}`).toBe('string')
        }
      }
    }
  })

  it('flattens alpha surfaces to fully opaque hex (widget RemoteViews cannot blend transparency)', () => {
    const flattened = ['background', 'surface', 'surfaceGround', 'border', 'borderMuted'] as const
    for (const scheme of colorSchemes) {
      for (const mode of modes) {
        const colors = toWidgetColors(createTokensV2(scheme, mode), mode)
        for (const key of flattened) {
          expect(colors[key], `${scheme}/${mode}:${key}`).toMatch(OPAQUE_HEX)
        }
      }
    }
  })

  it('keeps text legible against the widget background (no contrast collapse)', () => {
    for (const scheme of colorSchemes) {
      for (const mode of modes) {
        const colors = toWidgetColors(createTokensV2(scheme, mode), mode)
        expect(colors.textPrimary, `${scheme}/${mode}`).not.toBe(colors.background)
      }
    }
  })

  it('matches the granted canvas palette in both modes', () => {
    expect(toWidgetColors(createTokensV2('purple', 'dark'), 'dark')).toEqual({
      background: '#131315',
      surface: '#1D1D1F',
      surfaceGround: '#09090B',
      textPrimary: '#F4F4F6',
      textSecondary: '#C9C9CC',
      textMuted: '#8F8F93',
      border: '#2B2B2D',
      borderMuted: '#2B2B2D',
      overdue: '#FE9A00',
      streakText: '#ED773E',
      statusEmpty: '#8B8B8E',
    })
    expect(toWidgetColors(createTokensV2('purple', 'light'), 'light')).toEqual({
      background: '#FFFFFF',
      surface: '#F1F1F2',
      surfaceGround: '#FAFAFA',
      textPrimary: '#1A1A1D',
      textSecondary: '#424247',
      textMuted: '#68686D',
      border: '#E6E6E8',
      borderMuted: '#E6E6E8',
      overdue: '#7D5700',
      streakText: '#A63A00',
      statusEmpty: '#7E7E82',
    })
  })

  it('keeps the canvas primary text bytes aligned with the shipped theme', () => {
    const canvasColors = readFileSync(resolve(
      process.cwd(),
      '../../design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/colors.css',
    ), 'utf8')
    const darkPrimaryText = canvasColors.match(/--p-orange-raised-text:(#[0-9A-F]{6});/)?.[1]
    const lightPrimaryText = canvasColors.match(/--p-orange-lm-raised-text:(#[0-9A-F]{6});/)?.[1]

    expect(canvasColors).toContain('--primary-text:var(--p-orange-raised-text);')
    expect(canvasColors).toContain('--primary-text:var(--p-orange-lm-raised-text);')
    expect(darkPrimaryText).toBe(createTokensV2('purple', 'dark').primaryText)
    expect(lightPrimaryText).toBe(createTokensV2('purple', 'light').primaryText)
  })

  it('qualifies every preference by mode under the native color prefix', () => {
    const preferences = toWidgetThemePreferences('purple')

    expect(preferences.dark_background).toBe('#131315')
    expect(preferences.dark_surface).toBe('#1D1D1F')
    expect(preferences.light_background).toBe('#FFFFFF')
    expect(preferences.light_surface).toBe('#F1F1F2')
    expect(preferences.dark_streakText).toBe('#ED773E')
    expect(preferences.light_streakText).toBe('#A63A00')
    expect(Object.keys(preferences)).toHaveLength(22)
  })

  it('uses the muted text role for native progress and completed due-time text', () => {
    const widgetProviderSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetProvider.kt',
    )
    const widgetServiceSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetService.kt',
    )
    expect(widgetProviderSource).toContain(
      'setModeAwareColor(R.id.widget_subtitle, "setTextColor", colorModes) { it.textMuted }',
    )
    expect(widgetServiceSource).toContain(
      'views.setModeAwareColor(R.id.item_title, "setTextColor", colorModes) { it.textMuted }',
    )
    expect(widgetServiceSource).toContain(
      'R.id.item_time, "setTextColor", colorModes',
    )
  })


  it('paints the streak figure in the accent and its unit in fg-3, with no flame graphic', () => {
    const widgetProviderSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetProvider.kt',
    )
    const widgetServiceSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetService.kt',
    )
    const widgetLayout = readWidgetSource('res/layout/widget_layout.xml')
    const lightResources = readWidgetSource('res/values/widget_colors.xml')
    const darkResources = readWidgetSource('res/values-night/widget_colors.xml')

    expect(widgetProviderSource).toContain(
      'setModeAwareColor(R.id.widget_streak, "setTextColor", colorModes) { it.streakText }',
    )
    expect(widgetProviderSource).toContain(
      'setModeAwareColor(R.id.widget_streak_unit, "setTextColor", colorModes) { it.textMuted }',
    )
    for (const source of [widgetProviderSource, widgetServiceSource]) {
      expect(source).not.toContain('createFlameBitmap')
      expect(source).not.toContain('widget_flame')
    }

    expect(widgetLayout).toContain('android:textColor="@color/widget_streak_text"')
    expect(widgetLayout).toContain('android:textColor="@color/widget_fg_3"')
    expect(widgetLayout).not.toContain('widget_flame')

    expect(lightResources).toContain('<color name="widget_streak_text">#A63A00</color>')
    expect(darkResources).toContain('<color name="widget_streak_text">#ED773E</color>')
  })

  it('carries both night modes through the full widget layout and collection rows', () => {
    const widgetProviderSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetProvider.kt',
    )
    const widgetServiceSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetService.kt',
    )
    const widgetLayout = readWidgetSource('res/layout/widget_layout.xml')
    const widgetItemLayout = readWidgetSource('res/layout/widget_item.xml')
    const lightResources = readWidgetSource('res/values/widget_colors.xml')
    const darkResources = readWidgetSource('res/values-night/widget_colors.xml')

    expect(widgetProviderSource).toContain('getThemeColorModes(context)')
    expect(widgetProviderSource).toContain(
      'setModeAwareBitmap(R.id.widget_bg, lightBackground, darkBackground)',
    )
    expect(widgetProviderSource).toContain(
      'setModeAwareColor(R.id.widget_subtitle, "setTextColor", colorModes) { it.textMuted }',
    )
    expect(widgetServiceSource).toContain('getThemeColorModes(context)')
    expect(widgetServiceSource).toContain(
      'setModeAwareBitmap(R.id.item_bg, lightBackground, darkBackground)',
    )
    expect(widgetServiceSource).toContain(
      'R.id.item_time, "setTextColor", colorModes',
    )
    expect(widgetServiceSource).toContain(
      'Build.VERSION.SDK_INT < Build.VERSION_CODES.S',
    )
    expect(widgetServiceSource).toContain(
      'views.setImageViewResource(R.id.item_bg, backgroundResource)',
    )
    expect(widgetLayout).toContain('android:src="@drawable/widget_bg_fallback"')
    expect(widgetItemLayout).toContain('android:textColor="@color/widget_item_title"')
    expect(lightResources).toContain('<color name="widget_bg">#FAFAFA</color>')
    expect(darkResources).toContain('<color name="widget_bg">#09090B</color>')
  })

  it('renders the cached loading state before refreshing collection rows', () => {
    const widgetProviderSource = readWidgetSource(
      'java/org/useorbit/app/widget/OrbitWidgetProvider.kt',
    )
    const refreshHandler = widgetProviderSource.slice(
      widgetProviderSource.indexOf('override fun onReceive'),
      widgetProviderSource.indexOf('override fun onEnabled'),
    )

    const loadingStateIndex = refreshHandler.indexOf(
      '.putBoolean(CACHE_REFRESHING, true)',
    )
    const fullUpdateIndex = refreshHandler.indexOf(
      'updateWidgetLayout(context, appWidgetManager, id)',
      loadingStateIndex,
    )
    const collectionRefreshIndex = refreshHandler.indexOf(
      'appWidgetManager.notifyAppWidgetViewDataChanged',
    )

    expect(loadingStateIndex).toBeGreaterThanOrEqual(0)
    expect(fullUpdateIndex).toBeGreaterThan(loadingStateIndex)
    expect(collectionRefreshIndex).toBeGreaterThan(fullUpdateIndex)
  })
})
