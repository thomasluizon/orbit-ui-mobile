import { afterEach, describe, expect, it } from 'vitest'
import { schemes } from '@orbit/shared/theme'
import { colors, createColors, createNav, getRuntimeTheme, setRuntimeTheme } from '@/lib/theme'

describe('mobile theme runtime', () => {
  afterEach(() => {
    setRuntimeTheme({ scheme: 'purple', themeMode: 'dark' })
  })

  it('uses light theme values when requested', () => {
    const lightColors = createColors('purple', 'light')
    const darkColors = createColors('purple', 'dark')

    expect(lightColors.background).not.toBe(darkColors.background)
    expect(lightColors.textPrimary).not.toBe(darkColors.textPrimary)
    expect(lightColors.primary).not.toBe(darkColors.primary)
  })

  it('updates the exported theme proxy when runtime theme changes', () => {
    setRuntimeTheme({ scheme: 'blue', themeMode: 'light' })

    expect(getRuntimeTheme()).toEqual({ scheme: 'blue', themeMode: 'light' })
    expect(colors.background).toBe(createColors('blue', 'light').background)
    expect(colors.primary).toBe(createColors('blue', 'light').primary)
    expect(createNav('blue', 'light').activeColor).toBe(colors.primary)
  })

  it('derives nav glass and translucent tokens from the active theme mode', () => {
    const lightColors = createColors('rose', 'light')
    const darkColors = createColors('rose', 'dark')
    const lightNav = createNav('rose', 'light')
    const darkNav = createNav('rose', 'dark')

    expect(lightColors.border50).not.toBe(darkColors.border50)
    expect(lightColors.handle).not.toBe(darkColors.handle)
    expect(lightNav.tabBarBg).toBe(schemes.rose.light.navGlassBg)
    expect(lightNav.tabBarBorder).toBe(schemes.rose.light.navGlassBorder)
    expect(darkNav.tabBarBg).toBe(schemes.rose.dark.navGlassBg)
    expect(darkNav.tabBarBorder).toBe(schemes.rose.dark.navGlassBorder)
  })
})
