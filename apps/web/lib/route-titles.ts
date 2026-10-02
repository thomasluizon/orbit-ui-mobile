export const ROUTE_TITLE_KEYS = {
  '/': 'nav.today',
  '/about': 'about.title',
  '/calendar': 'nav.calendar',
  '/habits/new': 'habits.form.newHabit',
  '/habits/[id]': 'habits.detail.screenTitle',
  '/notifications': 'notifications.title',
  '/profile': 'nav.profile',
  '/progress': 'nav.progress',
  '/search': 'habits.search.title',
  '/support': 'profile.support.title',
  '/upgrade': 'upgrade.pitchTitle',
  '/wrapped': 'wrapped.title',
  '/auth-callback': 'auth.signIn',
  '/login': 'auth.signIn',
  '/onboarding': 'habits.form.newHabit',
  '/delete-account': 'deleteAccount.title',
  '/privacy': 'privacy.title',
  '/terms': 'terms.title',
  '/chat': 'chat.title',
  '/r/[code]': 'auth.signIn',
  '/step-up': 'stepUp.title',
  '/turnstile-bridge': 'auth.signIn',
  '/[...missing]': 'notFoundPage.title',
} as const

export type TitledRoute = keyof typeof ROUTE_TITLE_KEYS

export function resolveTitledRoute(pathname: string): TitledRoute {
  if (Object.hasOwn(ROUTE_TITLE_KEYS, pathname)) return pathname as TitledRoute
  if (/^\/habits\/[^/]+$/.test(pathname)) return '/habits/[id]'
  if (/^\/r\/[^/]+$/.test(pathname)) return '/r/[code]'
  return '/[...missing]'
}

export function formatRouteTitle(surface: string): string {
  return `${surface} · Orbit`
}
