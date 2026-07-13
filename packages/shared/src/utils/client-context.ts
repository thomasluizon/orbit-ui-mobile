export const CLIENT_TIME_ZONE_HEADER = 'X-Orbit-Time-Zone'

export const APP_VERSION_HEADER = 'X-App-Version'

export function getClientTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone.trim()
    return timeZone || null
  } catch {
    return null
  }
}

export function buildClientTimeZoneHeaders(): Record<string, string> {
  const timeZone = getClientTimeZone()
  return timeZone
    ? { [CLIENT_TIME_ZONE_HEADER]: timeZone }
    : {}
}
