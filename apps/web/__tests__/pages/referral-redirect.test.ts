import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string): never => {
    throw new Error(`redirect:${href}`)
  }),
  token: 'session-token' as string | null,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/lib/auth-api', () => ({
  resolveServerSession: () => Promise.resolve({ token: mocks.token }),
}))

import ReferralRedirectPage from '@/app/r/[code]/page'

describe('ReferralRedirectPage', () => {
  beforeEach(() => {
    mocks.redirect.mockClear()
    mocks.token = 'session-token'
  })

  it('redirects an authenticated referral visit to Today at the root route', async () => {
    await expect(
      ReferralRedirectPage({ params: Promise.resolve({ code: 'orbit_123' }) }),
    ).rejects.toThrow('redirect:/')

    expect(mocks.redirect).toHaveBeenCalledWith('/')
  })
})
