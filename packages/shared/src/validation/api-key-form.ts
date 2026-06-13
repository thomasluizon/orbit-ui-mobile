const API_KEY_EXPIRY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Parses an API-key expiry entered as `YYYY-MM-DDTHH:MM[:SS]`, interpreted as
 * UTC. Returns the UTC instant, or null when the format or calendar fields are
 * invalid. Both apps must use this so the same input yields the same
 * `expiresAtUtc` regardless of the device's local timezone.
 */
export function parseApiKeyExpiryUtc(value: string): Date | null {
  const match = API_KEY_EXPIRY_PATTERN.exec(value.trim())

  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second] = match
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0'),
    ),
  )

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute) ||
    parsed.getUTCSeconds() !== Number(second ?? '0')
  ) {
    return null
  }

  return parsed
}
