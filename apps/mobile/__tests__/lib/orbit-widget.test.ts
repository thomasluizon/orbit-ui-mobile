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
      statusEmpty: '#89898D',
    })
  })

  it('qualifies every preference by mode under the native color prefix', () => {
    const preferences = toWidgetThemePreferences('purple')

    expect(preferences.dark_background).toBe('#131315')
    expect(preferences.dark_surface).toBe('#1D1D1F')
    expect(preferences.light_background).toBe('#FFFFFF')
    expect(preferences.light_surface).toBe('#F1F1F2')
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
      'setModeAwareColor(R.id.widget_subtitle, "setTextColor", colorModes) { it.textMuted }',
    )
    expect(widgetServiceSource).toContain(
      'views.setModeAwareColor(R.id.item_title, "setTextColor", colorModes) { it.textMuted }',
    )
    expect(widgetServiceSource).toContain(
      'R.id.item_time, "setTextColor", colorModes',
    )
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
})
