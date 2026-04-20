import type { Href } from 'expo-router'

export function buildUpgradeHref(from: string): Href {
  return {
    pathname: '/upgrade',
    params: { from },
  } as Href
}

export function getUpgradeFallbackRoute(
  from: string | string[] | undefined,
  fallbackRoute: Href,
): Href {
  if (typeof from === 'string' && from.length > 0) {
    return from as Href
  }

  if (
    Array.isArray(from) &&
    typeof from[0] === 'string' &&
    from[0].length > 0
  ) {
    return from[0] as Href
  }

  return fallbackRoute
}
