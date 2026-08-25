import type { ThemeMode } from '@orbit/shared/types/profile'

export type CaptureLocale = 'en' | 'pt-BR'

export interface CapturePreferences {
  locale: CaptureLocale
  theme: ThemeMode
}

type SearchParameter = string | string[] | undefined

export const captureBuildEnabled =
  process.env.EXPO_PUBLIC_CAPTURE_MODE === 'true'

function firstParameter(value: SearchParameter): string | undefined {
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
