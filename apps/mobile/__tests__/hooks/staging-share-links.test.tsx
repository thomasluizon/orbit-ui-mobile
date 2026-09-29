import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createMockRecap } from '@orbit/shared/__tests__/factories'
import { AUTH_CALLBACK_URL } from '@/lib/google-auth-callback'
import { useRecap } from '@/hooks/use-recap'
import { useReferral } from '@/hooks/use-referral'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { router: { origin: 'https://app-staging.useorbit.org' } } } },
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))

describe('staging share links', () => {
  it('uses the configured App Link origin for referral links and Google callbacks', () => {
    mocks.useQuery.mockReturnValue({ data: { code: 'XYZ789', stats: null } })
    const result: { current?: ReturnType<typeof useReferral> } = {}
    function Harness() {
      result.current = useReferral()
      return null
    }

    TestRenderer.act(() => { TestRenderer.create(<Harness />) })
    expect(AUTH_CALLBACK_URL).toBe('https://app-staging.useorbit.org/auth-callback')
    expect(result.current!.referralUrl).toBe('https://app-staging.useorbit.org/r/XYZ789')
  })

  it('uses the configured App Link origin for the recap link from the API', async () => {
    mocks.useQuery.mockReturnValue({ data: undefined })
    mocks.apiClient.mockResolvedValue(createMockRecap())
    useRecap('week', true)

    const recap = await mocks.useQuery.mock.calls.at(-1)![0].queryFn()
    expect(recap.shareDeepLink).toBe('https://app-staging.useorbit.org/r/ABC123?recap=week')
  })
})
