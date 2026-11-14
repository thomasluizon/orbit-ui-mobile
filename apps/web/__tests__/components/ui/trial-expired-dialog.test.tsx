import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { buildAccountScopedStorageKey } from '@orbit/shared/utils'
import { holdAccount } from '@/__tests__/support/account-change'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR', push: vi.fn(), plans: { savingsPercent: 41 } as { savingsPercent: number } | null, reducedMotion: false }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }) }
})
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-profile', () => ({ useTrialExpired: () => true }))
vi.mock('@/hooks/use-subscription-plans', () => ({ useSubscriptionPlans: () => ({ plans: mocks.plans }) }))
vi.mock('@/hooks/use-viewport-match', () => ({
  useViewportMatch: (query: string) => query.includes('prefers-reduced-motion') ? mocks.reducedMotion : false,
}))

const SEEN_KEY = buildAccountScopedStorageKey('orbit_trial_expired_seen', 'user-1')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.locale = 'en'
  mocks.plans = { savingsPercent: 41 }
  mocks.reducedMotion = false
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('user-1')
  useUIStore.setState({ openOverlayIds: [], showCreateModal: false })
  enableTestFlags('orbit_guided_flows')
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('the trial expired dialog', () => {
  it.each([
    ['en', 'Your Pro trial ended', 'These Pro features will pause unless you subscribe.', 'View plans', 'Stay free'],
    ['pt-BR', 'O teste Pro acabou', 'Estes recursos Pro ficam pausados se você não assinar.', 'Ver planos', 'Continuar grátis'],
  ] as const)('is a centred dialog with a name, Orbit in Parado, the current lines and the two actions in %s', (locale, heading, subtitle, seePlans, stayFree) => {
    mocks.locale = locale
    render(<TrialExpiredModal />)
    const dialog = screen.getByRole('dialog', { name: heading })
    expect(dialog).toHaveAccessibleDescription(subtitle)
    expect(document.querySelector('.orbit-sheet-panel')).toHaveAttribute('data-centred', 'true')
    const content = document.querySelector<HTMLElement>('[data-trial-expired-dialog]')!
    expect(content.querySelector('[data-orbit-face="rig"]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(document.querySelector('[data-orbit-state="feliz"]')).toBeNull()
    const messages = locale === 'en' ? en : ptBR
    for (const line of [messages.trial.expired.eyebrow, messages.trial.expired.astraCeiling, messages.trial.expired.calendarSync, messages.trial.expired.retrospective, messages.trial.expired.proactiveAstra]) {
      expect(within(content).getByText(line)).toBeInTheDocument()
    }
    expect(within(content).getAllByText(messages.trial.expired.paused)).toHaveLength(4)
    expect(content).toHaveTextContent('41%')
    expect(within(content).getAllByRole('button').map((button) => button.textContent)).toEqual([seePlans, stayFree])
  })

  it('moves focus to the filled action', async () => {
    render(<TrialExpiredModal />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'View plans' })).toHaveFocus())
  })

  it('opens the upgrade route and records the notice as seen on View plans', async () => {
    render(<TrialExpiredModal />)
    fireEvent.click(screen.getByRole('button', { name: 'View plans' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/upgrade'))
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes and keeps the person on the free plan on Stay free', async () => {
    render(<TrialExpiredModal />)
    fireEvent.click(screen.getByRole('button', { name: 'Stay free' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each([[false, 'running'], [true, 'still']] as const)('draws Orbit with reduced motion %s as %s', (reducedMotion, loop) => {
    mocks.reducedMotion = reducedMotion
    render(<TrialExpiredModal />)
    expect(document.querySelector('[data-trial-expired-dialog] [data-orbit-face="rig"]')).toHaveAttribute('data-orbit-loop', loop)
  })

  it('shows no savings line before the plans read answers', () => {
    mocks.plans = null
    render(<TrialExpiredModal />)
    expect(document.querySelector('[data-trial-expired-dialog]')).not.toHaveTextContent('%')
  })
})
