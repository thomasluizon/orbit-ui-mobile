import type { ThemeMode } from '@orbit/shared/types/profile'

export type CaptureLocale = 'en' | 'pt-BR'

export interface CapturePreferences {
  locale: CaptureLocale
  theme: ThemeMode
}

type SearchParameter = string | string[]

export const captureBuildEnabled =
  process.env.EXPO_PUBLIC_CAPTURE_MODE === 'true'

function firstParameter(value: SearchParameter | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function resolveCapturePreferences(
  enabled: boolean,
  parameters: Readonly<{
    captureLocale?: SearchParameter
    captureTheme?: SearchParameter
  }>,
): CapturePreferences | null {
  if (!enabled) return null

  const locale = firstParameter(parameters.captureLocale)
  const theme = firstParameter(parameters.captureTheme)
  if (
    (locale !== 'en' && locale !== 'pt-BR') ||
    (theme !== 'light' && theme !== 'dark')
  ) {
    return null
  }

  return { locale, theme }
}

export function shouldExposeOnboardingRoute(
  captureEnabled: boolean,
  isAuthenticated: boolean,
  onboardingLocallyDone: boolean,
): boolean {
  return !captureEnabled && !isAuthenticated && !onboardingLocallyDone
}

export function captureRouteProbeId(
  pathname: string,
  topSegment: string | undefined,
): string {
  if (pathname === '/' && topSegment === '(tabs)') {
    return 'capture-route-tabs-index'
  }
  if (pathname === '/' && topSegment === '(onboarding)') {
    return 'capture-route-onboarding-index'
  }

  const slug = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replaceAll(/[^a-zA-Z0-9-]/g, '-'))
    .join('-')
  return `capture-route-${slug || 'root'}`
}

/**
 * The locale and theme a render is allowed to expose, as one comparable value.
 *
 * Applying a capture tuple is asynchronous, because `i18n.changeLanguage` is. Readiness therefore
 * cannot be a boolean an effect flips: an effect is passive, so the render that FIRST sees a new
 * tuple commits before it runs, and that commit would expose the route probe while the previous
 * locale is still on screen. Comparing this key against the last applied one decides readiness
 * during render instead, so a tuple that has not finished applying can never be capture-ready.
 */
export function captureTupleKey(preferences: CapturePreferences | null): string {
  return preferences ? `${preferences.locale}|${preferences.theme}` : 'none'
}
