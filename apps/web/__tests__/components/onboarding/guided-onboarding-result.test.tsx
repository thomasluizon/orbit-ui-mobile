import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GuidedOnboardingResult } from '@/components/onboarding/guided-onboarding-result'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'

const mocks = vi.hoisted(() => ({
  detail: { data: undefined as Record<string, unknown> | undefined, isError: false, isFetching: false, refetch: vi.fn() },
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabitDetail: () => mocks.detail }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (time: string | null | undefined) => time ?? '' }) }))

const savedHabit = { id: 'habit-1', title: 'Correr', isGeneral: false, dueDate: '2026-11-16', dueTime: '07:00', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible: false, days: [], intervalWeeks: 1 }
const onPrimary = vi.fn()
const onClose = vi.fn()

function mount(locale: 'en' | 'pt-BR', props: { habitId: string | null; signedOut?: boolean }) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
      <GuidedOnboardingResult habitId={props.habitId} signedOut={props.signedOut ?? false} timeZone="UTC" onPrimary={onPrimary} onClose={onClose} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  mocks.detail = { data: undefined, isError: false, isFetching: false, refetch: vi.fn() }
  onPrimary.mockReset()
  onClose.mockReset()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe.each([{ locale: 'pt-BR', copy: ptBR }, { locale: 'en', copy: en as typeof ptBR }] as const)('the onboarding result dialog in $locale', ({ locale, copy }) => {
  it('states a failed read of the saved habit with Orbit in Parado and a retry, and never the done title', () => {
    mocks.detail.isError = true
    mount(locale, { habitId: 'habit-1' })
    const dialog = screen.getByRole('dialog', { name: copy.onboarding.flow.done.readFailed })
    expect(dialog.querySelector('[data-onboarding-result-error]')).toHaveAttribute('data-orbit-state', 'parado')
    expect(screen.getByRole('alert')).toHaveTextContent(copy.onboarding.flow.done.readFailed)
    expect(screen.queryByText(copy.result.title)).not.toBeInTheDocument()
    expect(dialog.querySelector('[data-orbit-state="feliz"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: copy.common.retry }))
    expect(mocks.detail.refetch).toHaveBeenCalledOnce()
  })

  it('keeps the retry busy while the read runs again', () => {
    mocks.detail.isError = true
    mocks.detail.isFetching = true
    mount(locale, { habitId: 'habit-1' })
    expect(screen.getByRole('button', { name: copy.common.retry })).toHaveAttribute('aria-busy', 'true')
  })

  it('opens the done dialog with the sentence of the saved habit once the read succeeds', () => {
    mocks.detail.data = savedHabit
    mount(locale, { habitId: 'habit-1' })
    expect(screen.getByRole('dialog', { name: copy.result.title })).toBeInTheDocument()
    expect(document.querySelector('[data-result-dialog]')).toHaveAttribute('data-orbit-state', 'feliz')
    expect(document.querySelector('[data-onboarding-result-error]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: copy.result.seeToday }))
    expect(onPrimary).toHaveBeenCalledOnce()
  })

  it('shows nothing while the first read runs, and nothing when no habit was created', () => {
    mocks.detail.isFetching = true
    const view = mount(locale, { habitId: 'habit-1' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()
    mount(locale, { habitId: null })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('states the miss when the habit that waits on this device is not in the store, and reads the store again on retry', async () => {
    act(() => { useOnboardingDraftStore.setState({ habits: [] }) })
    const rehydrate = vi.spyOn(useOnboardingDraftStore.persist, 'rehydrate').mockResolvedValue(undefined)
    mount(locale, { habitId: '0', signedOut: true })
    expect(screen.getByRole('dialog', { name: copy.onboarding.flow.done.readFailed })).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: copy.common.retry })) })
    expect(rehydrate).toHaveBeenCalledOnce()
    rehydrate.mockRestore()
  })
})
