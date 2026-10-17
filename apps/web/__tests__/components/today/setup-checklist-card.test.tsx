import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import type { Profile } from '@orbit/shared/types/profile'
import { SetupChecklistCard } from '@/components/today/setup-checklist-card'
import { useUIStore } from '@/stores/ui-store'

const profileState = vi.hoisted(() => ({ profile: undefined as Profile | undefined }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => profileState }))

function card(locale = 'en') {
  return <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><SetupChecklistCard /></NextIntlClientProvider>
}

beforeEach(async () => {
  profileState.profile = createMockProfile({ isTrialActive: false })
  useUIStore.persist.setOptions({ name: 'orbit-ui-store' })
  localStorage.setItem('orbit-ui-store', JSON.stringify({ state: { setupChecklistDismissed: false }, version: 6 }))
  await useUIStore.persist.rehydrate()
})
afterEach(() => vi.restoreAllMocks())

describe('setup checklist', () => {
  it.each(['en', 'pt-BR'])('derives every item and progress from profile flags in %s', (locale) => {
    profileState.profile = createMockProfile({ isTrialActive: false, hasCreatedFirstHabit: true, hasTriedAstra: true })
    render(card(locale))
    const messages = locale === 'en' ? en : pt
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText(messages.today.setupChecklist.items.createHabit).parentElement).toHaveTextContent(messages.habits.completed)
    expect(screen.getByText(messages.today.setupChecklist.items.logHabit).parentElement).not.toHaveTextContent(messages.habits.completed)
    expect(screen.getByRole('status')).toHaveTextContent(locale === 'en' ? '2 of 3 done' : '2 de 3 concluídos')
  })

  it.each(['loading', 'onboarding', 'trial', 'complete', 'dismissed'])('withholds the card for %s', async (state) => {
    if (state === 'loading') profileState.profile = undefined
    if (state === 'onboarding') profileState.profile = createMockProfile({ hasCompletedOnboarding: false, isTrialActive: false })
    if (state === 'trial') profileState.profile = createMockProfile({ isTrialActive: true })
    if (state === 'complete') profileState.profile = createMockProfile({ hasCompletedOnboardingChecklist: true, isTrialActive: false })
    if (state === 'dismissed') await useUIStore.getState().setSetupChecklistDismissed(true)
    render(card())
    expect(screen.queryByRole('region', { name: en.today.setupChecklist.title })).not.toBeInTheDocument()
  })

  it('shows a persistence error and allows retry after a failed dismissal', async () => {
    render(card())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Storage is full') })
    fireEvent.click(screen.getByRole('button', { name: en.today.setupChecklist.dismiss }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(en.today.setupChecklist.dismissError))
    expect(useUIStore.getState().setupChecklistDismissed).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: en.today.setupChecklist.dismiss }))
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument())
    await useUIStore.persist.rehydrate()
    expect(useUIStore.getState().setupChecklistDismissed).toBe(true)
  })

  it('disables dismissal while storage is pending and prevents repeated writes', async () => {
    const storage = useUIStore.persist.getOptions().storage!
    let finish!: () => void
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    render(card())
    const dismiss = screen.getByRole('button', { name: en.today.setupChecklist.dismiss })
    fireEvent.click(dismiss)
    expect(dismiss).toBeDisabled()
    expect(dismiss).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(dismiss)
    expect(write).toHaveBeenCalledOnce()
    await act(async () => finish())
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})
