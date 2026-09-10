export interface JwtSessionPayload {
  exp?: number
  email?: string
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'?: string
  sub?: string
  nameid?: string
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'?: string
}

export function decodeJwtPayload(token: string): JwtSessionPayload | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return JSON.parse(atob(payload)) as JwtSessionPayload
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
