import {
  motionDurations,
  resolveDarkNeutrals,
  resolveLightNeutrals,
  type ColorScheme,
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

/** Resolved canvas hex for the scheme/mode (drives meta theme-color). */
export function canvasColor(scheme: ColorScheme, theme: ThemeMode): string {
  return theme === 'light'
    ? resolveLightNeutrals(scheme).bg
    : resolveDarkNeutrals(scheme).bg
}

export function applyThemeTokensToDOM(
  scheme: ColorScheme,
  theme: ThemeMode,
  animate = false,
) {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  if (animate) {
    root.classList.add('theme-transitioning')
    setTimeout(() => {
      root.classList.remove('theme-transitioning')
    }, motionDurations.theme)
  }

  if (theme === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }

  for (const s of VALID_COLOR_SCHEMES) root.classList.remove(`scheme-${s}`)
  root.classList.add(`scheme-${scheme}`)

  root.style.setProperty('color-scheme', theme)

  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', canvasColor(scheme, theme))
  }

  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (metaStatusBar) {
    metaStatusBar.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  }
}
