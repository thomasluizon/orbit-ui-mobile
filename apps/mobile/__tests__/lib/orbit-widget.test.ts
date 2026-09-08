import { describe, expect, it } from 'vitest'
import { schemes } from '@orbit/shared/theme'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { createTokensV2 } from '@/lib/theme'
import { toWidgetColors, toWidgetThemePreferences } from '@/lib/orbit-widget'

const OPAQUE_HEX = /^#[0-9a-fA-F]{6}$/
const colorSchemes = Object.keys(schemes) as ColorScheme[]
const modes: ThemeMode[] = ['dark', 'light']

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
})
