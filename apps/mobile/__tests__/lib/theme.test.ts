import { afterEach, describe, expect, it } from 'vitest'
import {
  colors,
  createColors,
  createSurfaces,
  getRuntimeTheme,
  setRuntimeTheme,
  surfaces,
} from '@/lib/theme'

describe('mobile theme runtime', () => {
  afterEach(() => {
    setRuntimeTheme({ scheme: 'purple', themeMode: 'dark' })
  })

  it('uses light theme values when requested', () => {
    const lightColors = createColors('purple', 'light')
    const darkColors = createColors('purple', 'dark')

    expect(lightColors.background).not.toBe(darkColors.background)
    expect(lightColors.border).not.toBe(darkColors.border)
    expect(lightColors.primary).not.toBe(darkColors.primary)
  })

  it('updates the exported theme proxy when runtime theme changes', () => {
    setRuntimeTheme({ scheme: 'blue', themeMode: 'light' })

    expect(getRuntimeTheme()).toEqual({ scheme: 'blue', themeMode: 'light' })
    expect(colors.background).toBe(createColors('blue', 'light').background)
    expect(colors.primary).toBe(createColors('blue', 'light').primary)
  })

  it('derives semantic surface presets from the active theme mode', () => {
    const lightSurfaces = createSurfaces('green', 'light')
    const darkSurfaces = createSurfaces('green', 'dark')

    expect(lightSurfaces.elevated.backgroundColor).toBe(createColors('green', 'light').surfaceElevated)
    expect(darkSurfaces.elevated.backgroundColor).toBe(createColors('green', 'dark').surfaceElevated)
    expect(lightSurfaces.elevated.shadow.shadowOpacity).toBeLessThan(darkSurfaces.elevated.shadow.shadowOpacity)

    setRuntimeTheme({ scheme: 'green', themeMode: 'light' })
    expect(surfaces.screen.backgroundColor).toBe(lightSurfaces.screen.backgroundColor)
  })
})
