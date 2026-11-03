import 'server-only'
import { isIP } from 'node:net'

export const VISITOR_IP_HEADER = 'CF-Connecting-IP'

export function buildSmokeBypassHeaders(request: Request): Record<string, string> {
  const value = request.headers.get('X-Orbit-Smoke-Bypass')
  if (!value || value.length > 256 || value.includes(',')) return {}
  return { 'X-Orbit-Smoke-Bypass': value }
}

export function buildBffForwardingHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {}
  const secret = process.env.BFF_FORWARDING_SECRET
  if (secret) headers['X-Orbit-Bff-Secret'] = secret

  const visitorIp = request.headers.get(VISITOR_IP_HEADER)
  if (visitorIp && isIP(visitorIp) !== 0) {
    headers['X-Orbit-Client-Ip'] = visitorIp
  }

  return headers
}
