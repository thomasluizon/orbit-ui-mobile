/**
 * Ordered route-prefix → i18n key map for the desktop topbar title. Order is
 * significant: more specific prefixes (e.g. `/calendar-sync`, `/social/challenges`)
 * MUST precede their broader parents so the first match wins.
 */
const TOPBAR_TITLE_ROUTES: readonly (readonly [string, string])[] = [
  ['/calendar-sync', 'calendar.title'],
  ['/calendar', 'nav.calendar'],
  ['/insights', 'nav.insights'],
  ['/chat', 'nav.astra'],
  ['/explore', 'nav.explore'],
  ['/profile', 'nav.profile'],
  ['/social/challenges', 'challenges.title'],
  ['/social', 'social.title'],
  ['/preferences', 'preferences.title'],
  ['/ai-settings', 'aiSettings.title'],
  ['/advanced', 'advancedSettings.title'],
  ['/about', 'about.title'],
  ['/support', 'profile.support.title'],
  ['/achievements', 'gamification.title'],
  ['/streak', 'streakDisplay.title'],
  ['/retrospective', 'retrospective.title'],
  ['/upgrade', 'upgrade.title'],
  ['/wrapped', 'wrapped.title'],
  ['/public-profile', 'profile.publicProfile.title'],
]

/**
 * Resolves the i18n key for the desktop topbar title from the current route,
 * or `null` when the topbar shows no title (the home view and unmapped routes).
 * Pure — the caller feeds the returned key through its translator.
 */
export function resolveTopbarTitleKey(
  pathname: string,
  onHome: boolean,
): string | null {
  if (onHome) return null
  for (const [prefix, key] of TOPBAR_TITLE_ROUTES) {
    if (pathname.startsWith(prefix)) return key
  }
  return null
}
