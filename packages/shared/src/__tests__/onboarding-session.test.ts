import { describe, expect, it, vi } from 'vitest'
import { API, bindOnboardingSetup, createOnboardingSession, type OnboardingAttester, type OnboardingTransport } from '../api'

const suggestion = { emoji: '📖', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: '18:00', subHabits: [], checklistItems: [] }
const expiry = '2099-01-01T00:00:00+00:00'
function harness() {
  const transport = vi.fn<OnboardingTransport>().mockImplementation(async (path) => {
    if (path === API.onboarding.challenge) return { body: { challenge: 'server-challenge', expiresAtUtc: expiry }, installId: null }
    if (path === API.onboarding.install) return { body: { installId: 'signed-install', expiresAtUtc: expiry }, installId: null }
    return { body: suggestion, installId: 'rotated-install' }
  })
  const attester: OnboardingAttester = { platform: 'web', enroll: vi.fn(async () => ({ platform: 'web' as const, token: 'enrollment-proof' })), assert: vi.fn(async () => ({ platform: 'web' as const, token: 'setup-proof' })) }
  return { transport, attester, session: createOnboardingSession(transport) }
}

describe('anonymous onboarding session', () => {
  it('enrolls, binds a fresh proof and rotates its single-use credential in memory', async () => {
    const { transport, attester, session } = harness()
    expect(await session.suggest('  Ler às 18h 📖  ', 'pt-BR', attester)).toEqual(suggestion)
    expect(attester.enroll).toHaveBeenCalledWith('server-challenge')
    const binding = bindOnboardingSetup('signed-install', 'Ler às 18h 📖', 'pt-BR')
    expect(binding).toBe(`orbit-onboarding-setup-v1\nsigned-install\n${Buffer.from('Ler às 18h 📖', 'utf8').toString('base64')}\npt-BR`)
    expect(attester.assert).toHaveBeenCalledWith(binding)
    expect(transport).toHaveBeenLastCalledWith(API.onboarding.suggestSetup, { title: 'Ler às 18h 📖', language: 'pt-BR', attestation: { platform: 'web' as const, token: 'setup-proof' } }, 'signed-install')
    await session.suggest('Read', 'en', attester)
    expect(transport).toHaveBeenCalledTimes(4)
    expect(attester.assert).toHaveBeenLastCalledWith(bindOnboardingSetup('rotated-install', 'Read', 'en'))
    expect(attester.assert).toHaveBeenCalledTimes(2)
  })

  it.each([API.onboarding.challenge, API.onboarding.install, API.onboarding.suggestSetup])('ends an attempt after a failure at %s without retrying', async (failedPath) => {
    const { transport, attester, session } = harness()
    const normal = transport.getMockImplementation()!
    transport.mockImplementation(async (path, ...args) => {
      if (path === failedPath) throw new Error('ONBOARDING_LIMIT')
      return normal(path, ...args)
    })
    await expect(session.suggest('Read', 'en', attester)).rejects.toThrow('ONBOARDING_LIMIT')
    expect(transport.mock.calls.filter(([path]) => path === failedPath)).toHaveLength(1)
  })

  it('never reuses a spent credential after an unavailable setup or a malformed answer', async () => {
    const { transport, attester, session } = harness()
    const normal = transport.getMockImplementation()!
    transport.mockImplementationOnce(normal).mockImplementationOnce(normal).mockRejectedValueOnce(new Error('ONBOARDING_UNAVAILABLE'))
    await expect(session.suggest('Read', 'en', attester)).rejects.toThrow()
    await session.suggest('Read', 'en', attester)
    expect(transport.mock.calls.filter(([path]) => path === API.onboarding.install)).toHaveLength(2)
    transport.mockResolvedValueOnce({ body: { invalid: true }, installId: 'rotated-again' })
    await expect(session.suggest('Read', 'en', attester)).rejects.toThrow()
    await session.suggest('Read', 'en', attester)
    expect(transport.mock.calls.filter(([path]) => path === API.onboarding.install)).toHaveLength(3)
  })

  it('drops credentials at session end and refuses later calls', async () => {
    const { session, attester, transport } = harness()
    await session.suggest('Read', 'en', attester)
    session.dispose()
    await expect(session.suggest('Read', 'en', attester)).rejects.toThrow('unavailable')
    expect(transport).toHaveBeenCalledTimes(3)
  })
})
