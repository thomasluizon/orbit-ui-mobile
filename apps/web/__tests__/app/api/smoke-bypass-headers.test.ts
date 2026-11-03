import { describe, expect, it } from 'vitest'
import { buildBffForwardingHeaders, buildSmokeBypassHeaders } from '@/app/api/_utils/bff-forwarding'

describe('smoke bypass forwarding boundary', () => {
  it.each(['smoke-secret', 's'.repeat(256)])('preserves a single bounded value', (value) => {
    const request = new Request('https://app.example.test/api/auth/send-code', {
      headers: { 'X-Orbit-Smoke-Bypass': value },
    })
    expect(buildSmokeBypassHeaders(request)).toEqual({ 'X-Orbit-Smoke-Bypass': value })
    expect(buildBffForwardingHeaders(request)).not.toHaveProperty('X-Orbit-Smoke-Bypass')
  })

  it.each([undefined, '', 's'.repeat(257), 'first, second'])('drops an invalid value', (value) => {
    const request = new Request('https://app.example.test/api/auth/send-code', {
      headers: value === undefined ? {} : { 'X-Orbit-Smoke-Bypass': value },
    })
    expect(buildSmokeBypassHeaders(request)).toEqual({})
  })

  it('drops repeated header entries after Headers combines them', () => {
    const headers = new Headers()
    headers.append('X-Orbit-Smoke-Bypass', 'first')
    headers.append('x-orbit-smoke-bypass', 'second')
    const request = new Request('https://app.example.test/api/auth/send-code', { headers })
    expect(buildSmokeBypassHeaders(request)).toEqual({})
  })
})
