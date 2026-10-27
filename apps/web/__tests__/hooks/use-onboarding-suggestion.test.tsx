import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnboardingSuggestion } from '@/hooks/use-onboarding-suggestion'

const mocks = vi.hoisted(() => ({ action: vi.fn(), authorized: vi.fn(), online: true, desktop: false, proof: 0 }))
vi.mock('@/app/actions/onboarding', () => ({ requestAnonymousOnboarding: mocks.action }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: mocks.authorized }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/desktop-runtime', () => ({ desktopRuntime: () => mocks.desktop ? {} : undefined }))
vi.mock('@/components/auth/turnstile-widget', () => ({ TurnstileWidget: ({ onToken, onStateChange, quiet }: { onToken: (token: string) => void; onStateChange: (state: string) => void; quiet: boolean }) => <div data-quiet={quiet}><button onClick={() => onToken(`proof-${++mocks.proof}`)}>verify</button><button onClick={() => onStateChange('failed')}>fail verification</button></div> }))
const suggestion = { emoji: '📖', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: '18:00', subHabits: [], checklistItems: [] }
let hook!: ReturnType<typeof useOnboardingSuggestion>
function Harness({ live = false }: { live?: boolean }) { const current = useOnboardingSuggestion(live); React.useEffect(() => { hook = current }, [current]); return current.verification }
async function read() {
  let pending!: ReturnType<typeof hook.mutateAsync>
  act(() => { pending = hook.mutateAsync({ title: 'Read', language: 'en' }) })
  fireEvent.click(await screen.findByRole('button', { name: 'verify' }))
  await waitFor(() => expect(mocks.action).toHaveBeenCalledWith('install', expect.anything(), undefined))
  fireEvent.click(await screen.findByRole('button', { name: 'verify' }))
  return pending
}

describe('web onboarding suggestion adapter', () => {
  beforeEach(() => {
    mocks.action.mockReset(); mocks.authorized.mockReset(); mocks.online = true; mocks.desktop = false; mocks.proof = 0
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
    mocks.action.mockImplementation(async (operation) => ({ ok: true, data: operation === 'challenge'
      ? { body: { challenge: 'server-challenge', expiresAtUtc: '2099-01-01T00:00:00Z' }, installId: null }
      : operation === 'install' ? { body: { installId: 'signed-install', expiresAtUtc: '2099-01-01T00:00:00Z' }, installId: null }
        : { body: suggestion, installId: 'rotated-install' } }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([false, true])('gets separate managed proofs for enrollment and setup with desktop=%s', async (desktop) => {
    mocks.desktop = desktop
    const view = render(<Harness />)
    expect(await read()).toEqual(suggestion)
    const platform = desktop ? 'desktop' : 'web'
    expect(mocks.action.mock.calls).toEqual([
      ['challenge', { platform }, undefined],
      ['install', { challenge: 'server-challenge', attestation: { platform, token: 'proof-1' } }, undefined],
      ['suggestSetup', { title: 'Read', language: 'en', attestation: { platform, token: 'proof-2' } }, 'signed-install'],
    ])
    expect(mocks.authorized).not.toHaveBeenCalled()
    expect(view.container).toBeEmptyDOMElement()
    let next!: ReturnType<typeof hook.mutateAsync>
    act(() => { next = hook.mutateAsync({ title: 'Walk', language: 'pt-BR' }) })
    fireEvent.click(await screen.findByRole('button', { name: 'verify' }))
    await expect(next).resolves.toEqual(suggestion)
    expect(mocks.action).toHaveBeenLastCalledWith('suggestSetup', expect.objectContaining({ language: 'pt-BR', attestation: { platform, token: 'proof-3' } }), 'rotated-install')
  })

  it('keeps signed-in suggestions on the authorized endpoint', async () => {
    mocks.authorized.mockResolvedValue(suggestion)
    render(<Harness live />)
    await expect(hook.mutateAsync({ title: 'Read', language: 'en' })).resolves.toEqual(suggestion)
    expect(mocks.action).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([429, 503, 500])('ends an anonymous attempt after HTTP %s', async (status) => {
    mocks.action.mockResolvedValue({ ok: false, status, error: 'unavailable', sessionRefreshFailed: false })
    render(<Harness />)
    await expect(hook.mutateAsync({ title: 'Read', language: 'en' })).rejects.toThrow('unavailable')
    expect(mocks.action).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ends a failed widget without adding error copy', async () => {
    render(<Harness />)
    let pending!: ReturnType<typeof hook.mutateAsync>
    act(() => { pending = hook.mutateAsync({ title: 'Read', language: 'en' }) })
    const rejected = expect(pending).rejects.toThrow('proof unavailable')
    fireEvent.click(await screen.findByRole('button', { name: 'fail verification' }))
    await rejected
    expect(mocks.action).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not attempt unavailable proofs or offline suggestions', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    const view = render(<Harness />)
    expect(hook.available).toBe(false)
    mocks.online = false
    view.rerender(<Harness live />)
    expect(hook.available).toBe(false)
    expect(mocks.action).not.toHaveBeenCalled()
  })
})
