export const PROFILE_STEP_UP_DESTINATIONS = {
  keys: { route: '/profile/ai' },
  delete: { route: '/profile/account' },
} as const

export const LEGACY_PROFILE_ROUTES = [
  { source: '/preferences', destination: '/profile/preferences' },
  { source: '/advanced', destination: '/profile/ai' },
  { source: '/ai-settings', destination: '/profile/ai' },
  { source: '/profile/astra', destination: '/profile/ai' },
] as const

export function getProfileSectionDestination(search: string, hash: string): string | null {
  const parameters = new URLSearchParams(search)
  const sections: Readonly<Record<string, string>> = {
    '#you': '/profile/preferences',
    '#ai': '/profile/ai',
    '#astra': '/profile/ai',
    '#api-keys': '/profile/ai',
    '#notifications': '/profile/notifications',
    '#ending': '/profile/account',
  }
  const destination = parameters.get('subscription') === 'success'
    ? '/profile/ai'
    : sections[hash]
  if (!destination) return null
  const query = parameters.toString()
  return query ? `${destination}?${query}` : destination
}
