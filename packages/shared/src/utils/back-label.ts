const BACK_DESTINATION_KEYS: Readonly<Record<string, string>> = {
  '/login': 'auth.signIn',
  '/calendar': 'nav.calendar',
  '/calendar-sync': 'nav.calendar',
  '/progress': 'nav.progress',
  '/profile/astra': 'profile.groups.astra',
  '/profile/account': 'profile.submenus.account',
  '/profile/preferences': 'profile.submenus.preferences',
  '/profile/notifications': 'profile.groups.notifications',
  '/habits/new': 'habits.form.newHabit',
  '/chat': 'chat.title',
  '/about': 'about.title',
  '/support': 'profile.support.title',
  '/wrapped': 'wrapped.title',
  '/notifications': 'notifications.title',
  '/search': 'habits.search.screenTitle',
  '/privacy': 'privacy.title',
  '/terms': 'terms.title',
  '/upgrade': 'upgrade.pitchTitle',
}

type BackLabelTranslator = (key: string, values?: { destination: string }) => string

export function getBackLabel(route: string | undefined, translate: BackLabelTranslator): string {
  const pathname = route?.split(/[?#]/)[0]
  if (pathname === '/' || pathname === '/(tabs)') return translate('common.backToToday')
  if (pathname === '/profile') return translate('common.backToProfile')
  if (pathname?.startsWith('/habits/') && !BACK_DESTINATION_KEYS[pathname]) return translate('common.backToHabit')
  const destinationKey = BACK_DESTINATION_KEYS[pathname ?? '']
  return destinationKey
    ? translate('common.backToDestination', { destination: translate(destinationKey) })
    : translate('common.back')
}
