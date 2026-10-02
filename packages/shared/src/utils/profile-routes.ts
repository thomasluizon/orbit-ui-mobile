export const PROFILE_STEP_UP_DESTINATIONS = {
  keys: { route: '/profile/astra', labelKey: 'profile.groups.astra' },
  delete: { route: '/profile/account', labelKey: 'profile.submenus.account' },
} as const

export const LEGACY_PROFILE_ROUTES = [
  { source: '/preferences', destination: '/profile/preferences' },
  { source: '/advanced', destination: '/profile/astra' },
  { source: '/ai-settings', destination: '/profile/astra' },
] as const

export function getProfileSectionDestination(search: string, hash: string): string | null {
  const parameters = new URLSearchParams(search)
  const sections: Readonly<Record<string, string>> = {
    '#you': '/profile/preferences',
    '#astra': '/profile/astra',
    '#api-keys': '/profile/astra',
    '#notifications': '/profile/notifications',
    '#ending': '/profile/account',
  }
  const destination = parameters.get('subscription') === 'success'
    ? '/profile/astra'
    : sections[hash]
  if (!destination) return null
  const query = parameters.toString()
  return query ? `${destination}?${query}` : destination
}
