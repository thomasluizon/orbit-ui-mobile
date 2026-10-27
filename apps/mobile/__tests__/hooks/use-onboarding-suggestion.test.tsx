import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API, ONBOARDING_INSTALL_HEADER } from '@orbit/shared/api'
import { useOnboardingSuggestion } from '@/hooks/use-onboarding-suggestion'

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ api: vi.fn(), authorized: vi.fn(), online: true, available: true }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.api }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: mocks.authorized }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/onboarding-attestation', () => ({ canAttestOnboarding: () => mocks.available, createOnboardingAttester: () => Promise.resolve({ platform: 'android', enroll: () => Promise.resolve({ platform: 'android', token: 'enrollment-proof' }), assert: () => Promise.resolve({ platform: 'android', token: 'setup-proof' }) }) }))
const suggestion = { emoji: '📖', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: '18:00', subHabits: [], checklistItems: [] }
let hook!: ReturnType<typeof useOnboardingSuggestion>
const trees: ReturnType<typeof TestRenderer.create>[] = []
async function mount(live = false) {
  function Harness() { const current = useOnboardingSuggestion(live); React.useEffect(() => { hook = current }, [current]); return null }
  await TestRenderer.act(() => { trees.push(TestRenderer.create(<Harness />)) })
}

describe('native onboarding suggestion adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.online = true; mocks.available = true
    mocks.api.mockImplementation((path, options) => {
      if (path === API.onboarding.challenge) return Promise.resolve({ challenge: 'server-challenge', expiresAtUtc: '2099-01-01T00:00:00Z' })
      if (path === API.onboarding.install) return Promise.resolve({ installId: 'signed-install', expiresAtUtc: '2099-01-01T00:00:00Z' })
      options.onResponseHeaders(new Headers({ [ONBOARDING_INSTALL_HEADER]: 'rotated-install' }))
      return Promise.resolve(suggestion)
    })
  })
  afterEach(async () => { for (const tree of trees.splice(0)) await TestRenderer.act(() => tree.update(<></>)) })

  it('enrolls a signed-out install and sends its credential with a fresh setup proof', async () => {
    await mount()
    expect(await hook.mutateAsync({ title: 'Read', language: 'en' })).toEqual(suggestion)
    expect(mocks.api.mock.calls.map(([path]) => path)).toEqual([API.onboarding.challenge, API.onboarding.install, API.onboarding.suggestSetup])
    expect(mocks.api).toHaveBeenLastCalledWith(API.onboarding.suggestSetup, expect.objectContaining({ silent: true, skipAuthRecovery: true, headers: { [ONBOARDING_INSTALL_HEADER]: 'signed-install' }, body: JSON.stringify({ title: 'Read', language: 'en', attestation: { platform: 'android', token: 'setup-proof' } }) }))
    await hook.mutateAsync({ title: 'Walk', language: 'pt-BR' })
    expect(mocks.api).toHaveBeenLastCalledWith(API.onboarding.suggestSetup, expect.objectContaining({ headers: { [ONBOARDING_INSTALL_HEADER]: 'rotated-install' } }))
    expect(mocks.authorized).not.toHaveBeenCalled()
  })

  it('keeps signed-in reads on the authorized endpoint', async () => {
    mocks.authorized.mockResolvedValue(suggestion)
    await mount(true)
    await expect(hook.mutateAsync({ title: 'Read', language: 'en' })).resolves.toEqual(suggestion)
    expect(mocks.authorized).toHaveBeenCalledOnce()
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it.each(['offline', 'ONBOARDING_LIMIT', 'ONBOARDING_UNAVAILABLE', 'error'])('does not retry %s', async (failure) => {
    mocks.api.mockRejectedValue(new Error(failure))
    await mount()
    await expect(hook.mutateAsync({ title: 'Read', language: 'en' })).rejects.toThrow(failure)
    expect(mocks.api).toHaveBeenCalledOnce()
  })

  it('disables anonymous reads when the platform proof is unavailable', async () => {
    mocks.available = false
    await mount()
    expect(hook.available).toBe(false)
    mocks.online = false
    await mount(true)
    expect(hook.available).toBe(false)
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
