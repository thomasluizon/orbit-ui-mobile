import { NextResponse } from 'next/server'
import { getAuthToken } from '@/lib/auth-api'

// Hard cap on the base64url JWT payload segment. A legitimate Orbit JWT payload
// is small (user id + exp + iat + a few claims). 4 KB is generous and blocks
// memory-amplification attacks where a malicious cookie holds a megabyte-scale
// payload segment that JSON.parse must decode before failing.
const MAX_JWT_PAYLOAD_SEGMENT_LENGTH = 4096

/**
 * BFF: GET /api/auth/session
 * Reads the auth_token cookie, decodes the JWT expiry, and returns { expiresAt }.
 * Does NOT validate the signature -- that's the backend's job.
 * This is only used for the client-side expiry monitor.
 */
export async function GET() {
  try {
    const token = await getAuthToken()

    if (!token) {
      return NextResponse.json({ expiresAt: null }, { status: 401 })
    }

    // Decode JWT payload (base64url, no signature verification)
    const parts = token.split('.')
    if (parts.length !== 3) {
      return NextResponse.json({ expiresAt: null }, { status: 401 })
    }

    const payloadSegment = parts[1]
    if (!payloadSegment || payloadSegment.length > MAX_JWT_PAYLOAD_SEGMENT_LENGTH) {
      return NextResponse.json({ expiresAt: null }, { status: 401 })
    }

    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf-8')
    ) as { exp?: number }

    if (!payload.exp) {
      return NextResponse.json({ expiresAt: null }, { status: 401 })
    }

    // exp is in seconds, convert to milliseconds for client
    return NextResponse.json({ expiresAt: payload.exp * 1000 })
  } catch {
    return NextResponse.json({ expiresAt: null }, { status: 500 })
  }
}
