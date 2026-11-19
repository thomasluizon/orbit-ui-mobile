import { z } from 'zod'
import { utf16Length } from './utf16-length'
import { MAX_API_KEY_NAME_LENGTH } from './constants'
import { getAccountDay, millisecondsUntilNextDay } from '../utils/dates'

const apiKeyNameSchema = z.string().trim().check(utf16Length('min', 1, 'orbitMcp.keyNameRequired')).check(utf16Length('max', MAX_API_KEY_NAME_LENGTH, 'orbitMcp.keyNameMaxLength'))

export function getApiKeyNameError(name: string): 'orbitMcp.keyNameRequired' | 'orbitMcp.keyNameMaxLength' | null {
  const result = apiKeyNameSchema.safeParse(name)
  if (result.success) return null
  return name.trim() ? 'orbitMcp.keyNameMaxLength' : 'orbitMcp.keyNameRequired'
}

export const apiKeyFormSchema = z.object({
  name: apiKeyNameSchema,
  expiresAt: z.string().transform((value, context) => {
    const expiry = validateApiKeyExpiry(value)
    if (!expiry.valid) {
      context.addIssue({ code: 'custom', message: 'orbitMcp.invalidExpiry' })
      return z.NEVER
    }
    return expiry.expiresAtUtc
  }),
})

const API_KEY_EXPIRY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export const API_KEY_EXPIRY_DEFAULT = ''

export type ApiKeyExpiryValidation =
  | { valid: true; expiresAtUtc: string | null }
  | { valid: false }

export function validateApiKeyExpiry(value: string, now = Date.now()): ApiKeyExpiryValidation {
  if (!value.trim()) return { valid: true, expiresAtUtc: null }
  const parsed = parseApiKeyExpiryUtc(value)
  if (!parsed || parsed.getTime() <= now) return { valid: false }
  return { valid: true, expiresAtUtc: parsed.toISOString() }
}

const TWELVE_HOURS = 12 * 60 * 60 * 1000

function expiryZone(timeZone: string | null | undefined): string | undefined {
  return timeZone || undefined
}

/** The day of an expiry draft in the account zone, as `yyyy-MM-dd`, for the date picker. Empty for a key that never expires and for a draft the parser cannot read. */
export function apiKeyExpiryDay(value: string, timeZone?: string | null): string {
  const expiry = parseApiKeyExpiryUtc(value)
  return expiry ? getAccountDay(expiry, expiryZone(timeZone)) : ''
}

/** The expiry draft of a day picked in the account zone: the last second of that day there, as UTC in the form `validateApiKeyExpiry` reads. No day is a key that never expires. */
export function apiKeyExpiryFromDay(day: string, timeZone?: string | null): string {
  if (!day) return API_KEY_EXPIRY_DEFAULT
  const zone = expiryZone(timeZone)
  const noon = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 12)
  const inside = getAccountDay(new Date(noon), zone) > day ? noon - TWELVE_HOURS : noon
  const lastSecond = inside + millisecondsUntilNextDay(new Date(inside), zone) - 1000
  return new Date(lastSecond).toISOString().slice(0, 19)
}

/** The first day a key can expire on: today in the account zone, whose last second is still ahead. */
export function apiKeyExpiryFirstDay(timeZone?: string | null, now = Date.now()): string {
  return getAccountDay(new Date(now), expiryZone(timeZone))
}

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
