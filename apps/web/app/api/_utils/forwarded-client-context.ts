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

function sanitizeClientIp(headerValue: string | null): string {
  const candidate = headerValue?.split(',')[0]?.trim() ?? ''
  return IP_PATTERN.test(candidate) ? candidate : ''
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

  return headers
}
