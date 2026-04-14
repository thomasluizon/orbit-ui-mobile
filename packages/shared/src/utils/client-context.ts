export const CLIENT_TIME_ZONE_HEADER = 'X-Orbit-Time-Zone'

export function getClientTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim()
    return timeZone ? timeZone : null
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
