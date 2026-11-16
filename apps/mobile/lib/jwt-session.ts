export interface JwtSessionPayload {
  exp?: number
  email?: string
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'?: string
  sub?: string
  nameid?: string
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'?: string
}

// WHY: a JWT segment is unpadded base64url, and atob rejects its legal `-` and `_` characters: https://www.rfc-editor.org/rfc/rfc7515#section-2
function decodeBase64Url(segment: string): string {
  const normalized = segment.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0)
  return new TextDecoder().decode(bytes)
}

export function decodeJwtPayload(token: string): JwtSessionPayload | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return JSON.parse(decodeBase64Url(payload)) as JwtSessionPayload
  } catch {
    return null
  }
}

export function getAccountIdFromPayload(payload: JwtSessionPayload | null): string | null {
  if (!payload) return null
  return payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
    ?? payload.nameid
    ?? payload.sub
    ?? null
}

export function getAccountIdFromToken(token: string): string | null {
  return getAccountIdFromPayload(decodeJwtPayload(token))
}
