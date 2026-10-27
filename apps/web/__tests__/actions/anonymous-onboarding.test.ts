import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from '@orbit/shared/api'
import { requestAnonymousOnboarding } from '@/app/actions/onboarding'

const mocks = vi.hoisted(() => ({ publicFetch: vi.fn(), incoming: new Headers({ 'CF-Connecting-IP': '203.0.113.1', Authorization: 'untrusted', 'X-Orbit-Bff-Secret': 'untrusted' }) }))
vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: vi.fn(), serverPublicFetch: mocks.publicFetch }))
vi.mock('next/headers', () => ({ headers: async () => mocks.incoming }))

describe('anonymous onboarding server action', () => {
  beforeEach(() => { mocks.publicFetch.mockReset(); vi.stubEnv('BFF_FORWARDING_SECRET', 'trusted-secret') })
  afterEach(() => vi.unstubAllEnvs())

  it('validates setup and carries the install header and trusted visitor identity without auth', async () => {
    const suggestion = { emoji: '📖', frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] }
    mocks.publicFetch.mockImplementation(async (_path, _init, _schema, observe) => {
      observe(new Headers({ 'X-Orbit-Install-Id': 'rotated-install' }))
      return suggestion
    })
    const request = { title: '  Read  ', language: 'en', attestation: { platform: 'web', token: 'fresh-proof' } }
    expect(await requestAnonymousOnboarding('suggestSetup', request, 'signed-install')).toEqual({ ok: true, data: { body: suggestion, installId: 'rotated-install' } })
    expect(mocks.publicFetch).toHaveBeenCalledWith(API.onboarding.suggestSetup, expect.objectContaining({ method: 'POST', cache: 'no-store', headers: { 'X-Orbit-Bff-Secret': 'trusted-secret', 'X-Orbit-Client-Ip': '203.0.113.1', 'X-Orbit-Install-Id': 'signed-install' }, body: JSON.stringify({ ...request, title: 'Read' }) }), undefined, expect.any(Function))
  })

  it('rejects malformed input before sending a request', async () => {
    expect(await requestAnonymousOnboarding('suggestSetup', { title: 'Read' })).toMatchObject({ ok: false })
    expect(mocks.publicFetch).not.toHaveBeenCalled()
  })

  it.each(['challenge', 'install'] as const)('uses the public %s endpoint with no install header', async (operation) => {
    mocks.publicFetch.mockResolvedValue({})
    const request = operation === 'challenge' ? { platform: 'desktop' } : { challenge: 'challenge', attestation: { platform: 'desktop', token: 'proof' } }
    await requestAnonymousOnboarding(operation, request)
    expect(mocks.publicFetch).toHaveBeenCalledWith(API.onboarding[operation], expect.objectContaining({ body: JSON.stringify(request), headers: { 'X-Orbit-Bff-Secret': 'trusted-secret', 'X-Orbit-Client-Ip': '203.0.113.1' } }), undefined, expect.any(Function))
  })
})
