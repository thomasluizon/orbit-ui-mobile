import type { NextRequest } from 'next/server'

const IP_PATTERN = /^[\d.:a-fA-F]+$/

const GEO_COUNTRY_HEADERS = [
  ['x-vercel-ip-country', 'X-Vercel-IP-Country'],
  ['cf-ipcountry', 'CF-IPCountry'],
  ['cloudfront-viewer-country', 'CloudFront-Viewer-Country'],
] as const

const PASS_THROUGH_HEADERS = [
  ['accept-language', 'Accept-Language'],
  ['x-orbit-time-zone', 'X-Orbit-Time-Zone'],
] as const

const TIME_ZONE_PATTERN = /^[A-Za-z0-9_./+-]{1,100}$/
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/

function sanitizeClientIp(headerValue: string | null): string {
  const candidate = headerValue?.split(',')[0]?.trim() ?? ''
  return IP_PATTERN.test(candidate) ? candidate : ''
}

export function sanitizeClientTimeZone(value: string | null): string | null {
  const candidate = value?.trim() ?? ''
  return TIME_ZONE_PATTERN.test(candidate) ? candidate : null
}

export function sanitizeClientCountryCode(value: string | null): string | null {
  const candidate = value?.trim().toUpperCase() ?? ''
  return COUNTRY_CODE_PATTERN.test(candidate) ? candidate : null
}

function countryCodeFromAcceptLanguage(value: string | null): string | null {
  if (!value) return null

  for (const entry of value.split(',')) {
    const languageTag = entry.split(';', 2)[0]?.trim()?.replaceAll('_', '-') ?? ''
    const parts = languageTag.split('-').map((part) => part.trim()).filter(Boolean)
    if (parts.length < 2) continue
    const countryCode = sanitizeClientCountryCode(parts.at(-1) ?? null)
    if (countryCode) return countryCode
  }

  return null
}

function countryCodeFromTimeZone(value: string | null): string | null {
  const timeZone = sanitizeClientTimeZone(value)
  if (!timeZone) return null

  return (
    timeZone.startsWith('America/') ||
    timeZone.startsWith('Brazil/')
  ) && (
    timeZone === 'America/Araguaina' ||
    timeZone === 'America/Bahia' ||
    timeZone === 'America/Belem' ||
    timeZone === 'America/Boa_Vista' ||
    timeZone === 'America/Campo_Grande' ||
    timeZone === 'America/Cuiaba' ||
    timeZone === 'America/Eirunepe' ||
    timeZone === 'America/Fortaleza' ||
    timeZone === 'America/Maceio' ||
    timeZone === 'America/Manaus' ||
    timeZone === 'America/Noronha' ||
    timeZone === 'America/Porto_Velho' ||
    timeZone === 'America/Recife' ||
    timeZone === 'America/Rio_Branco' ||
    timeZone === 'America/Santarem' ||
    timeZone === 'America/Sao_Paulo' ||
    timeZone === 'Brazil/Acre' ||
    timeZone === 'Brazil/DeNoronha' ||
    timeZone === 'Brazil/East' ||
    timeZone === 'Brazil/West'
  )
    ? 'BR'
    : null
}

function resolveOrbitCountryCode(request: NextRequest): string | null {
  for (const [headerName] of GEO_COUNTRY_HEADERS) {
    const countryCode = sanitizeClientCountryCode(request.headers.get(headerName))
    if (countryCode) return countryCode
  }

  const queryTimeZoneCountryCode = countryCodeFromTimeZone(request.nextUrl.searchParams.get('timeZone'))
  if (queryTimeZoneCountryCode) return queryTimeZoneCountryCode

  const headerTimeZoneCountryCode = countryCodeFromTimeZone(request.headers.get('x-orbit-time-zone'))
  if (headerTimeZoneCountryCode) return headerTimeZoneCountryCode

  return countryCodeFromAcceptLanguage(request.headers.get('accept-language'))
}

export function buildForwardedClientHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {}

  const cfConnectingIp = sanitizeClientIp(request.headers.get('cf-connecting-ip'))
  const vercelForwardedIp = sanitizeClientIp(request.headers.get('x-vercel-forwarded-for'))
  const forwardedIp = sanitizeClientIp(request.headers.get('x-forwarded-for'))
  const realIp = sanitizeClientIp(request.headers.get('x-real-ip'))
  const clientIp = cfConnectingIp || vercelForwardedIp || forwardedIp || realIp
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp
  }
  if (cfConnectingIp) {
    headers['CF-Connecting-IP'] = cfConnectingIp
  }
  if (realIp) {
    headers['X-Real-IP'] = realIp
  }

  for (const [headerName, forwardedHeaderName] of GEO_COUNTRY_HEADERS) {
    const value = request.headers.get(headerName)?.trim()
    if (value) {
      headers[forwardedHeaderName] = value
    }
  }

  for (const [headerName, forwardedHeaderName] of PASS_THROUGH_HEADERS) {
    const value = request.headers.get(headerName)?.trim()
    if (value) {
      headers[forwardedHeaderName] = value
    }
  }

  const orbitCountryCode = resolveOrbitCountryCode(request)
  if (orbitCountryCode) {
    headers['X-Orbit-Country-Code'] = orbitCountryCode
  }

  return headers
}
