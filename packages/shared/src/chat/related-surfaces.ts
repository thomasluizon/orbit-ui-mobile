/**
 * Maps the app-surface IDs the assistant emits in a describe_feature reply
 * (`ChatResponse.relatedSurfaces`) to their i18n label key and per-platform
 * client route. Both web and mobile consume this map; only the route field they
 * read differs (platform adapter). IDs not present here are dropped — an unknown
 * surface renders no link rather than a broken one.
 */
interface RelatedSurface {
  id: string
  labelKey: string
  webRoute: string
  mobileRoute: string
}

/**
 * The five surface IDs the feature-explanation bundle in orbit-api can emit
 * today (today, gamification, notifications, subscriptions, ai-settings).
 * Notifications live on the Today header bell, so they share the Today route.
 */
export const RELATED_SURFACE_ROUTES: Readonly<Record<string, RelatedSurface>> = {
  today: {
    id: 'today',
    labelKey: 'chat.related.surface.today',
    webRoute: '/',
    mobileRoute: '/',
  },
  gamification: {
    id: 'gamification',
    labelKey: 'chat.related.surface.gamification',
    webRoute: '/achievements',
    mobileRoute: '/achievements',
  },
  notifications: {
    id: 'notifications',
    labelKey: 'chat.related.surface.notifications',
    webRoute: '/',
    mobileRoute: '/',
  },
  subscriptions: {
    id: 'subscriptions',
    labelKey: 'chat.related.surface.subscriptions',
    webRoute: '/upgrade',
    mobileRoute: '/upgrade',
  },
  'ai-settings': {
    id: 'ai-settings',
    labelKey: 'chat.related.surface.aiSettings',
    webRoute: '/ai-settings',
    mobileRoute: '/ai-settings',
  },
}

/**
 * Resolves a list of raw surface IDs to their mapped entries, preserving order
 * and dropping unknown IDs and duplicates. Returns an empty array when nothing
 * resolves so callers can skip rendering the footer entirely.
 */
export function getRelatedSurfaces(
  ids: readonly string[] | null | undefined,
): RelatedSurface[] {
  if (!ids?.length) return []

  const resolved: RelatedSurface[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    const surface = RELATED_SURFACE_ROUTES[id]
    if (surface && !seen.has(id)) {
      seen.add(id)
      resolved.push(surface)
    }
  }

  return resolved
}
