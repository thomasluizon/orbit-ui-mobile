import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schemes } from '@orbit/shared/theme'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { createTokensV2 } from '@/lib/theme'
import { toWidgetColors, toWidgetThemePreferences } from '@/lib/orbit-widget'

const OPAQUE_HEX = /^#[0-9a-fA-F]{6}$/
const colorSchemes = Object.keys(schemes) as ColorScheme[]
const modes: ThemeMode[] = ['dark', 'light']

function readWidgetSource(relativePath: string) {
  return readFileSync(`modules/orbit-widget/android/src/main/${relativePath}`, 'utf8')
}

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
      streak: '#C4530F',
      streakText: '#F4F4F6',
      statusEmpty: '#5D5D60',
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
      overdue: '#946A00',
      streak: '#C4530F',
      streakText: '#1A1A1D',
      statusEmpty: '#89898D',
    })
  })

  it('qualifies every preference by mode under the native color prefix', () => {
    const preferences = toWidgetThemePreferences('purple')

    expect(preferences.dark_background).toBe('#131315')
    expect(preferences.dark_surface).toBe('#1D1D1F')
    expect(preferences.light_background).toBe('#FFFFFF')
    expect(preferences.light_surface).toBe('#F1F1F2')
    expect(preferences.dark_streakText).toBe('#F4F4F6')
    expect(preferences.light_streakText).toBe('#1A1A1D')
    expect(Object.keys(preferences)).toHaveLength(24)
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

  /**
   * Stage 2 replaces stage 1's flame bitmap with the figure the canvas actually draws.
   *
   * `design/canvas/Orbit Widget Android.dc.html` renders the streak as a 15sp 600-weight span in
   * `c.primary` followed by an 11sp `c.fg3` unit, baseline aligned with a 3px gap, and there is no
   * flame anywhere in it. Its own note reserves the accent for "one use only: the streak figure", so a
   * primary-tinted flame graphic would be a second use of it. Under D42 the drawing outranks
   * DESIGN.md prose, so this asserts the drawing.
   */
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
      'setModeAwareColor(R.id.widget_streak, "setTextColor", colorModes) { it.streak }',
    )
    expect(widgetProviderSource).toContain(
      'setModeAwareColor(R.id.widget_streak_unit, "setTextColor", colorModes) { it.textMuted }',
    )
    for (const source of [widgetProviderSource, widgetServiceSource]) {
      expect(source).not.toContain('createFlameBitmap')
      expect(source).not.toContain('widget_flame')
    }

    expect(widgetLayout).toContain('android:textColor="@color/widget_primary"')
    expect(widgetLayout).toContain('android:textColor="@color/widget_fg_3"')
    expect(widgetLayout).not.toContain('widget_flame')

    expect(lightResources).toContain('<color name="widget_primary">#C4530F</color>')
    expect(darkResources).toContain('<color name="widget_primary">#C4530F</color>')
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
