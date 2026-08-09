export type SocialTab = 'feed' | 'friends'

const LIVE_SOCIAL_TABS: readonly SocialTab[] = ['feed', 'friends']

/**
 * Accountability buddies are deleted, but `/social?tab=buddies` is already OUT THERE: it is the URL
 * of push notifications queued before the deletion ships and of inbox rows already persisted, and
 * the notification detail modals still offer View on them. Falling through to the default silently
 * landed those taps on the unrelated Feed tab, which reads as a bug rather than as a retired
 * feature.
 *
 * Retired destinations are therefore listed and redirected on purpose, to the surviving relationship
 * surface, so the mapping is visible and testable instead of accidental. Add a row here whenever a
 * social tab is retired while its links are still reachable from stored data.
 */
const RETIRED_SOCIAL_TABS: Readonly<Record<string, SocialTab>> = { buddies: 'friends' }

export function resolveSocialTab(tabParam: string | null | undefined): SocialTab {
  const candidate = tabParam ?? ''
  if ((LIVE_SOCIAL_TABS as readonly string[]).includes(candidate)) return candidate as SocialTab
  return RETIRED_SOCIAL_TABS[candidate] ?? 'feed'
}
