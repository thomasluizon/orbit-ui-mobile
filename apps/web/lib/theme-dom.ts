import {
  schemes,
  motionDurations,
  orbitalMotion,
  type ColorScheme,
  type ColorSchemeDefinition,
  type ThemeMode,
} from '@orbit/shared'

export const VALID_COLOR_SCHEMES = new Set<ColorScheme>([
  'purple',
  'blue',
  'green',
  'rose',
  'orange',
  'cyan',
])

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' ? 'light' : 'dark'
}

export function normalizeColorScheme(value: string | null | undefined): ColorScheme {
  return value && VALID_COLOR_SCHEMES.has(value as ColorScheme)
    ? (value as ColorScheme)
    : 'purple'
}

export function applyThemeTokensToDOM(
  scheme: ColorScheme,
  theme: ThemeMode,
  animate = false,
) {
  if (typeof document === 'undefined') return

  const def: ColorSchemeDefinition = schemes[scheme]
  const colors = def[theme]
  const root = document.documentElement

  if (animate) {
    root.classList.add('theme-transitioning')
    setTimeout(() => {
      root.classList.remove('theme-transitioning')
    }, motionDurations.theme)
  }

  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  root.style.setProperty('color-scheme', theme)

  const primary = theme === 'light' ? def.primaryLight : def.primary
  root.style.setProperty('--color-primary', primary)
  root.style.setProperty('--color-background', colors.background)
  root.style.setProperty('--color-surface-ground', colors.surfaceGround)
  root.style.setProperty('--color-surface', colors.surface)
  root.style.setProperty('--color-surface-elevated', colors.surfaceElevated)
  root.style.setProperty('--color-surface-overlay', colors.surfaceOverlay)
  root.style.setProperty('--color-card', colors.surface)
  root.style.setProperty('--color-card-border', colors.surfaceElevated)
  root.style.setProperty('--color-border', colors.border)
  root.style.setProperty('--color-border-muted', colors.borderMuted)
  root.style.setProperty('--color-border-emphasis', colors.borderEmphasis)
  root.style.setProperty('--color-text-primary', colors.textPrimary)
  root.style.setProperty('--color-text-secondary', colors.textSecondary)
  root.style.setProperty('--color-text-muted', colors.textMuted)
  root.style.setProperty('--color-text-faded', colors.textFaded)
  root.style.setProperty('--color-text-inverse', colors.textInverse)
  root.style.setProperty('--shadow-sm', colors.shadowSm)
  root.style.setProperty('--shadow-md', colors.shadowMd)
  root.style.setProperty('--shadow-lg', colors.shadowLg)
  root.style.setProperty('--shadow-glow', colors.shadowGlow)
  root.style.setProperty('--shadow-glow-sm', colors.shadowGlowSm)
  root.style.setProperty('--shadow-glow-lg', colors.shadowGlowLg)
  root.style.setProperty('--nav-glass-bg', colors.navGlassBg)
  root.style.setProperty('--nav-glass-border', colors.navGlassBorder)

  const scale = def.scale
  root.style.setProperty('--color-primary-50', scale[50] ?? '')
  root.style.setProperty('--color-primary-100', scale[100] ?? '')
  root.style.setProperty('--color-primary-200', scale[200] ?? '')
  root.style.setProperty('--color-primary-300', scale[300] ?? '')
  root.style.setProperty('--color-primary-400', scale[400] ?? '')
  root.style.setProperty('--color-primary-500', scale[500] ?? '')
  root.style.setProperty('--color-primary-600', scale[600] ?? '')
  root.style.setProperty('--color-primary-700', scale[700] ?? '')
  root.style.setProperty('--color-primary-800', scale[800] ?? '')
  root.style.setProperty('--color-primary-900', scale[900] ?? '')
  root.style.setProperty('--color-primary-950', scale[950] ?? '')
  root.style.setProperty('--primary-shadow', def.shadowRgb)

  const tint = theme === 'light'
    ? { bg: 0.3, bgHover: 0.38, border: 0.5, borderHover: 0.62, iconBg: 0.42, iconBgHover: 0.52 }
    : { bg: 0.1, bgHover: 0.15, border: 0.2, borderHover: 0.3, iconBg: 0.2, iconBgHover: 0.3 }
  root.style.setProperty('--primary-tint-bg', `rgba(${def.shadowRgb}, ${tint.bg})`)
  root.style.setProperty('--primary-tint-bg-hover', `rgba(${def.shadowRgb}, ${tint.bgHover})`)
  root.style.setProperty('--primary-tint-border', `rgba(${def.shadowRgb}, ${tint.border})`)
  root.style.setProperty('--primary-tint-border-hover', `rgba(${def.shadowRgb}, ${tint.borderHover})`)
  root.style.setProperty('--primary-tint-icon-bg', `rgba(${def.shadowRgb}, ${tint.iconBg})`)
  root.style.setProperty('--primary-tint-icon-bg-hover', `rgba(${def.shadowRgb}, ${tint.iconBgHover})`)
  root.style.setProperty('--surface-top-highlight', theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.85)')
  root.style.setProperty('--surface-sheen-start', theme === 'dark' ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.55)')
  root.style.setProperty('--surface-sheen-end', 'transparent')
  root.style.setProperty('--orbit-press-scale', String(orbitalMotion.press.scale))
  root.style.setProperty('--orbit-press-y', `${orbitalMotion.press.translateY}px`)
  root.style.setProperty('--orbit-elevated-press-scale', String(orbitalMotion.elevatedPress.scale))
  root.style.setProperty('--orbit-elevated-press-y', `${orbitalMotion.elevatedPress.translateY}px`)
  root.style.setProperty('--orbit-list-stagger', `${orbitalMotion.list.staggerMs}ms`)
  root.style.setProperty('--orbit-route-tint-opacity', String(orbitalMotion.route.backgroundTintOpacity))
  root.style.setProperty('--orbit-completion-peak-scale', String(orbitalMotion.completion.peakScale))
  root.style.setProperty('--orbit-completion-glow-scale', String(orbitalMotion.completion.glowScale))
  root.style.setProperty('--date-icon-filter', theme === 'dark' ? 'invert(0.6)' : 'none')

  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', colors.background)
  }

  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (metaStatusBar) {
    metaStatusBar.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  }
}
