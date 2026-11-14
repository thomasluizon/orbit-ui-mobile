import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { SETTLE_DELAY_MS } from '@orbit/shared/utils'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ getQueryData: () => undefined }),
}))
vi.mock('@/components/share/share-card-qr', () => ({ ShareCardQr: () => null }))

const shareCard = vi.hoisted(() => ({ hasError: false, canShareFiles: true, share: vi.fn(), download: vi.fn(), resetFeedback: vi.fn() }))
vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({ captureRef: { current: null }, isSharing: false, reportCaptureError: vi.fn(), ...shareCard }),
}))

import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { holdAccount } from '@/__tests__/support/account-change'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'

const LOCALES = [{ locale: 'pt-BR', messages: ptBR }, { locale: 'en', messages: en }] as const

/** Arms a streak milestone and waits the settle delay, then returns to real timers for the dialog queries. */
async function openPrompt(locale: (typeof LOCALES)[number] = LOCALES[0]) {
  vi.useFakeTimers()
  const view = render(
    <NextIntlClientProvider locale={locale.locale} messages={locale.messages}>
      <MilestoneSharePrompt />
    </NextIntlClientProvider>,
  )
  await act(async () => {
    useEngagementPromptStore.getState().armMilestoneSharePrompt('share-streak-7')
    await Promise.resolve()
  })
  await act(async () => { await vi.advanceTimersByTimeAsync(SETTLE_DELAY_MS) })
  vi.useRealTimers()
  return { ...view, copy: locale.messages.milestoneShare }
}

const feliz = () => document.querySelectorAll('svg[data-asset="orbit-mascot"][data-orbit-state="feliz"]')

beforeEach(() => {
  Object.assign(shareCard, { hasError: false, canShareFiles: true })
  shareCard.share.mockReset()
  shareCard.download.mockReset()
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('user-1')
  useEngagementPromptStore.setState({ promptedMilestoneKeys: [], lastPromptedAtIso: null, homeEntryDismissed: false, armedPrompt: null })
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], openOverlayIds: [] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the guided milestone share prompt on web', () => {
  it.each(LOCALES)('opens a centred dialog named by its title, with Orbit in Feliz and the three current actions in $locale', async (locale) => {
    enableTestFlags('orbit_guided_flows')
    const { copy } = await openPrompt(locale)

    const dialog = await screen.findByRole('dialog', { name: copy.title })
    expect(dialog).toHaveAccessibleDescription(copy.body)
    expect(dialog).toHaveAttribute('data-centred', 'true')
    expect(dialog).toHaveTextContent(copy.title)
    expect(dialog).toHaveTextContent(copy.body)
    expect(feliz()).toHaveLength(1)
    expect(feliz()[0]).toHaveAttribute('width', '96')
    expect(dialog.querySelector('[data-result-dialog]')).toBeNull()

    const card = screen.getByTestId('milestone-share-card')
    expect(card).toHaveTextContent(copy.streakEyebrow)
    expect(card.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-face', 'small')
    expect(card.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-loop', 'still')

    fireEvent.click(screen.getByRole('button', { name: copy.share }))
    expect(shareCard.share).toHaveBeenCalledWith(expect.objectContaining({ shareTitle: copy.shareTitle, shareText: copy.shareText }))
    fireEvent.click(screen.getByRole('button', { name: copy.download }))
    expect(shareCard.download).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: copy.later }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(useEngagementPromptStore.getState().promptedMilestoneKeys).toContain('share-streak-7')
  })

  it('closes on Escape', async () => {
    enableTestFlags('orbit_guided_flows')
    await openPrompt()

    await screen.findByRole('dialog')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the current message after a share that fails', async () => {
    enableTestFlags('orbit_guided_flows')
    shareCard.hasError = true
    const { copy } = await openPrompt()

    await screen.findByRole('dialog')
    expect(screen.getByRole('alert')).toHaveTextContent(copy.shareError)
  })

  it('never opens while the celebration panel is open', async () => {
    enableTestFlags('orbit_guided_flows')
    useUIStore.getState().enqueueCelebration('streak', { streak: 7 })
    await openPrompt()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(feliz()).toHaveLength(0)
  })

  it('leaves the screen while a celebration shows over an open dialog, and returns after it', async () => {
    enableTestFlags('orbit_guided_flows')
    const { copy } = await openPrompt()
    await screen.findByRole('dialog', { name: copy.title })

    act(() => { useUIStore.getState().enqueueCelebration('streak', { streak: 30 }) })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(feliz()).toHaveLength(0)

    act(() => { useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] }) })
    expect(await screen.findByRole('dialog', { name: copy.title })).toBeInTheDocument()
  })

  it('renders the current sheet with the flag off: no centred dialog and no Orbit in Feliz', async () => {
    const { copy } = await openPrompt()

    const dialog = await screen.findByRole('dialog', { name: copy.title })
    expect(dialog).toHaveAttribute('data-centred', 'false')
    expect(feliz()).toHaveLength(0)
    expect(screen.getByRole('button', { name: copy.later })).toBeInTheDocument()
  })
})
