import {
  motionDurations,
  neutralColors,
  selectionAlpha,
  schemes,
  statusConstants,
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
  return neutralColors[theme].bg
}

export function resolveWebThemeVariables(
  scheme: ColorScheme,
  theme: ThemeMode,
): Record<`--${string}`, string> {
  const definition = schemes[scheme]
  const accent = definition.accent[theme]
  const neutral = neutralColors[theme]
  const status = statusConstants[theme]

  return {
    '--bg': neutral.bg,
    '--bg-card': neutral.bgCard,
    '--bg-field': neutral.bgField,
    '--bg-well': neutral.bgWell,
    '--bg-elev': neutral.bgElev,
    '--bg-elev-2': neutral.bgElev2,
    '--bg-hover': neutral.bgHover,
    '--bg-sheet': neutral.bgElev,
    '--bg-sunk': neutral.bgSunk,
    '--hairline': neutral.hairline,
    '--border-control': neutral.borderControl,
    '--hairline-ghost': neutral.hairlineGhost,
    '--hairline-strong': neutral.hairlineStrong,
    '--fg-1': neutral.fg1,
    '--fg-2': neutral.fg2,
    '--fg-3': neutral.fg3,
    '--fg-4': neutral.fg4,
    '--primary': accent.primary,
    '--primary-hover': accent.primaryHover,
    '--primary-pressed': accent.primaryPressed,
    '--primary-soft': accent.primarySoft,
    '--primary-dim': accent.primaryDim,
    '--primary-rgb': accent.primaryRgb,
    '--fg-on-primary': definition.fgOnPrimary[theme],
    '--status-done': neutral.fg1,
    '--status-empty': neutral.fg4,
    '--status-frozen': 'var(--fg-2)',
    '--status-overdue': status.overdue,
    '--status-bad': status.bad,
    '--status-overdue-text': status.overdueText,
    '--status-bad-text': status.badText,
    '--fg-on-bad': status.fgOnBad,
    '--fg-on-overdue': status.fgOnOverdue,
    '--selection-bg': `rgba(${accent.primaryRgb},${selectionAlpha[theme]})`,
    '--scrim': neutral.scrim,
  }
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
  for (const [property, value] of Object.entries(resolveWebThemeVariables(scheme, theme))) {
    root.style.setProperty(property, value)
  }

  for (const metaThemeColor of document.querySelectorAll('meta[name="theme-color"]')) {
    metaThemeColor.setAttribute('content', canvasColor(scheme, theme))
  }

  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (metaStatusBar) {
    metaStatusBar.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  }
}
