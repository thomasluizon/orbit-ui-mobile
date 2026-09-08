import type { Href } from 'expo-router'

export function buildUpgradeHref(from: string): Href {
  return {
    pathname: '/upgrade',
    params: { from },
  }
}

export function getUpgradeFallbackRoute(
  from: string | string[] | undefined,
  fallbackRoute: Href,
): Href {
  if (typeof from === 'string' && from.length > 0) {
    return from
  }

  if (
    Array.isArray(from) &&
    typeof from[0] === 'string' &&
    from[0].length > 0
  ) {
    return from[0]
  }

  return fallbackRoute
}
