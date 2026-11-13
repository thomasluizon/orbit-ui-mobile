import type { ThemeMode } from '@orbit/shared/types/profile'
import { TOUCH_TARGET_MIN, MONTH_GRID_TARGET_MIN, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import {
  motionDurations,
  motionEasings,
  resolveMotionPreset,
  neutralColors,
  elevatedControlHoverFill,
  selectionAlpha,
  schemes,
  statusConstants,
  type ColorScheme,
} from '@orbit/shared/theme'

export const VALID_COLOR_SCHEMES = new Set<ColorScheme>(['orange'])

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' ? 'light' : 'dark'
}

export function resolveInitialTheme(
  cookieTheme: string | null | undefined,
  accountTheme?: string | null,
): ThemeMode | null {
  if (accountTheme === 'light' || accountTheme === 'dark') return accountTheme
  if (cookieTheme === 'light' || cookieTheme === 'dark') return cookieTheme
  return null
}

export function normalizeColorScheme(_value: string | null | undefined): ColorScheme {
  return 'orange'
}

/** Resolved canvas hex for the scheme/mode (drives meta theme-color). */
export function canvasColor(_scheme: ColorScheme, theme: ThemeMode): string {
  return neutralColors[theme].bg
}

export function resolveWebThemeVariables(
  scheme: ColorScheme,
  theme: ThemeMode,
): Record<`--${string}`, string> {
  const definition = schemes.orange
  const accent = definition.accent[theme]
  const neutral = neutralColors[theme]
  const status = statusConstants[theme]

  return {
    ...resolveWebMotionVariables(),
    '--touch-min': `${TOUCH_TARGET_MIN}px`,
    '--month-grid-touch-min': `${MONTH_GRID_TARGET_MIN}px`,
    '--pill-visible-min': `${SMALL_PILL_VISIBLE_MIN}px`,
    '--bg': neutral.bg,
    '--bg-card': neutral.bgCard,
    '--bg-field': neutral.bgField,
    '--bg-well': neutral.bgWell,
    '--bg-elev': neutral.bgElev,
    '--bg-elev-2': neutral.bgElev2,
    '--bg-hover': neutral.bgHover,
    '--bg-hover-opaque': neutral.bgHoverOpaque,
    '--bg-row-action': neutral.bgRowAction,
    '--bg-elev-hover': elevatedControlHoverFill(theme),
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
    '--track-empty': neutral.trackEmpty,
    '--primary': accent.primary,
    '--primary-hover': accent.primaryHover,
    '--primary-pressed': accent.primaryPressed,
    '--primary-soft': accent.primarySoft,
    '--primary-text': accent.primaryText,
    '--primary-dim': accent.primaryDim,
    '--primary-rgb': accent.primaryRgb,
    '--fg-on-primary': definition.fgOnPrimary[theme],
    '--status-done': neutral.fg1,
    '--status-empty': 'var(--track-empty)',
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

let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Crossfades only when the root already shows the opposite mode, so the first apply and a
 * same-mode apply stay instant. The mobile provider derives its overlay from the same change.
 */
export function applyThemeTokensToDOM(scheme: ColorScheme, theme: ThemeMode) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const oppositeMode: ThemeMode = theme === 'dark' ? 'light' : 'dark'

  if (root.classList.contains(oppositeMode)) {
    root.classList.add('theme-transitioning')
    clearTimeout(themeTransitionTimer)
    themeTransitionTimer = setTimeout(() => {
      root.classList.remove('theme-transitioning')
    }, motionDurations.theme)
  }

  root.classList.add(theme)
  root.classList.remove(oppositeMode)

  for (const s of VALID_COLOR_SCHEMES) root.classList.remove(`scheme-${s}`)
  root.classList.add('scheme-orange')

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

export function resolveWebMotionVariables(): Record<`--${string}`, string> {
  const variables: Record<`--${string}`, string> = {}
  for (const scenario of ['sheet', 'dialog', 'menu', 'toast', 'selection'] as const) {
    const preset = resolveMotionPreset(scenario)
    variables[`--motion-${scenario}-enter`] = `${preset.enterDuration}ms`
    variables[`--motion-${scenario}-exit`] = `${preset.exitDuration}ms`
    variables[`--motion-${scenario}-shift`] = `${preset.shift}px`
    variables[`--motion-${scenario}-scale`] = String(preset.scaleFrom)
  }
  variables['--dur-press'] = `${motionDurations.press}ms`
  variables['--dur-theme'] = `${motionDurations.theme}ms`
  variables['--motion-ease-enter'] = `cubic-bezier(${motionEasings.enter.join(',')})`
  variables['--motion-ease-exit'] = `cubic-bezier(${motionEasings.exit.join(',')})`
  variables['--motion-ease-standard'] = `cubic-bezier(${motionEasings.standard.join(',')})`
  return variables
}
