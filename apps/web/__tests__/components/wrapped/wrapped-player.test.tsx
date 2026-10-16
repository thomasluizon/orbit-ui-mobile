import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMockProfile, createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides, formatClosedWrappedMonth } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToastStore } from '@/stores/app-toast-store'

const translationMock = vi.hoisted<{ labels: Record<string, string> }>(() => ({ labels: {} }))

const profileState = vi.hoisted<{ available: boolean; isError: boolean; refetch: ReturnType<typeof vi.fn> }>(() => ({ available: true, isError: false, refetch: vi.fn() }))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: profileState.available ? createMockProfile({ weekStartDay: 1 }) : undefined,
    isError: profileState.isError,
    refetch: profileState.refetch,
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : translationMock.labels[key] ?? key,
}))

vi.mock('@/components/share/share-card-qr', () => ({
  ShareCardQr: () => null,
}))

const shareCardMock = vi.hoisted(() => ({
  isSharing: false,
  hasError: false,
  canShareFiles: true,
  share: vi.fn(),
  download: vi.fn(),
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null },
    ...shareCardMock,
  }),
}))

import { WrappedPlayer } from '@/app/(app)/wrapped/_components/wrapped-player'

function renderPlayer(onClose = vi.fn(), notice?: ReactNode) {
  const recap = createMockRecap()
  const slides = buildWrappedSlides(recap)
  const view = render(
    <WrappedPlayer
      slides={slides}
      recap={recap}
      period="week"
      onClose={onClose}
      notice={notice}
    />,
  )
  return { onClose, slides, unmount: view.unmount }
}

function advanceToLastSlide() {
  const lastIndex = buildWrappedSlides(createMockRecap()).length - 1
  for (let step = 0; step < lastIndex; step += 1) {
    fireEvent.click(screen.getByTestId('wrapped-next-zone'))
  }
}

describe('WrappedPlayer', () => {
  beforeEach(() => {
    profileState.available = true
    profileState.isError = false
    profileState.refetch.mockReset()
    translationMock.labels = {}
    shareCardMock.isSharing = false
    shareCardMock.hasError = false
    shareCardMock.canShareFiles = true
    shareCardMock.share.mockReset()
    shareCardMock.download.mockReset()
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })

  it.each([false, true])('keeps pending weekday content reachable without page tap zones, error %s', (isError) => {
    profileState.available = false
    profileState.isError = isError
    renderPlayer()
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByTestId('wrapped-next-zone'))
    expect(screen.getByTestId('wrapped-slide-consistency')).toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-next-zone')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-previous-zone')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'wrapped.next' })).toBeEnabled()
    if (isError) {
      fireEvent.click(screen.getByRole('button', { name: 'wrapped.retry' }))
      expect(profileState.refetch).toHaveBeenCalledOnce()
      expect(screen.getByTestId('wrapped-slide-consistency')).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'wrapped.next' }))
    expect(screen.getByTestId('wrapped-slide-streak')).toBeInTheDocument()
  })

  it('blocks first-run prompts while the player is open', () => {
    const { unmount } = renderPlayer()
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
    unmount()
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0)
  })

  it('opens on the intro slide and puts one segment per slide in the foot pager', () => {
    const { slides } = renderPlayer()
    const pager = screen.getByTestId('wrapped-pager')
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
    expect(within(pager).getAllByRole('listitem')).toHaveLength(slides.length)
    expect(
      screen.getByTestId('wrapped-slide-intro').compareDocumentPosition(pager)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(within(pager).getAllByRole('listitem')).toHaveLength(8)
  })

  it('uses the wide Wrapped frame for the player', () => {
    renderPlayer()
    const frame = screen.getByTestId('wrapped-frame')
    expect(frame).toHaveClass('max-w-[900px]')
    expect(frame).not.toHaveClass('md:max-w-[480px]')
  })

  it('shows the month header before its close control and formats a closed month', () => {
    const recap = createMockRecap()
    const slides = buildWrappedSlides(recap)
    const view = render(<WrappedPlayer slides={slides} recap={recap} period="month" onClose={vi.fn()} />)
    const eyebrow = screen.getByText('wrapped.player.eyebrow.month')
    const window = screen.getByText('wrapped.player.window.month')
    const close = screen.getByRole('button', { name: 'wrapped.close' })
    expect(eyebrow.compareDocumentPosition(window) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(window.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(window).toHaveStyle({ color: 'var(--fg-3)' })
    view.unmount()
    render(<WrappedPlayer slides={slides} recap={recap} period="month" closedMonth={{ year: 2026, month: 8 }} onClose={vi.fn()} />)
    expect(screen.getByText(formatClosedWrappedMonth({ year: 2026, month: 8 }, 'en'))).toBeInTheDocument()
  })

  it('pages forward and back through the Pager controls', () => {
    renderPlayer()
    const pager = screen.getByTestId('wrapped-pager')
    fireEvent.click(within(pager).getByRole('button', { name: 'wrapped.next' }))
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()
    fireEvent.click(within(pager).getByRole('button', { name: 'wrapped.previous' }))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
  })

  it.each([
    ['en', en, 'Back', 'Continue'],
    ['pt-BR', ptBR, 'Voltar', 'Continuar'],
  ] as const)('uses the drawn accessible Pager labels in %s', (_locale, messages, back, forward) => {
    translationMock.labels = {
      'wrapped.previous': messages.wrapped.previous,
      'wrapped.next': messages.wrapped.next,
    }
    renderPlayer()
    const pager = screen.getByTestId('wrapped-pager')
    expect(within(pager).getByRole('button', { name: back })).toBeDisabled()
    fireEvent.click(within(pager).getByRole('button', { name: forward }))
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()
    fireEvent.click(within(pager).getByRole('button', { name: back }))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
  })

  it('pages through the transparent tap zones', () => {
    renderPlayer()
    const previousZone = screen.getByTestId('wrapped-previous-zone')
    expect(previousZone).toBeDisabled()
    expect(previousZone).toHaveAttribute('tabindex', '-1')
    expect(previousZone.closest('[aria-hidden="true"]')).not.toBeNull()
    const nextZone = screen.getByTestId('wrapped-next-zone')
    expect(nextZone).toHaveAttribute('tabindex', '-1')
    expect(nextZone.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('button').every((button) => button.textContent || button.getAttribute('aria-label'))).toBe(true)
    fireEvent.click(screen.getByTestId('wrapped-next-zone'))
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('wrapped-previous-zone'))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
  })

  it('replaces the Pager forward control with one small trailing action row', () => {
    renderPlayer()
    advanceToLastSlide()
    const pager = screen.getByTestId('wrapped-pager')
    expect(within(pager).queryByRole('button', { name: 'wrapped.next' })).not.toBeInTheDocument()
    const back = within(pager).getByRole('button', { name: 'wrapped.previous' })
    const controls = back.closest<HTMLElement>('[data-slot="action-row"]')!
    expect(controls.style.justifyContent).toBe('flex-end')
    expect(controls.style.flexWrap).toBe('wrap')
    expect(controls.style.gap).toBe('12px')
    const buttons = within(controls).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['wrapped.previous', 'shareCard.download', 'shareCard.share'])
    expect(buttons.map((button) => button.dataset.variant)).toEqual(['ghost', 'ghost', 'primary'])
    expect(buttons.map((button) => button.dataset.size)).toEqual(['sm', 'sm', 'sm'])
    expect(screen.queryByTestId('wrapped-next-zone')).not.toBeInTheDocument()
  })

  it('shows both final actions as busy while the card renders', () => {
    shareCardMock.isSharing = true
    renderPlayer()
    advanceToLastSlide()

    const pager = screen.getByTestId('wrapped-pager')
    for (const button of within(pager).getAllByRole('button', { name: 'shareCard.share' })) {
      expect(button).toHaveAttribute('aria-busy', 'true')
    }
    for (const button of within(pager).getAllByRole('button', { name: 'shareCard.download' })) {
      expect(button).toHaveAttribute('aria-busy', 'true')
    }
  })

  it('makes download the primary action when file sharing is unsupported', () => {
    shareCardMock.canShareFiles = false
    renderPlayer()
    advanceToLastSlide()

    const pager = screen.getByTestId('wrapped-pager')
    expect(within(pager).queryByRole('button', { name: 'shareCard.share' })).not.toBeInTheDocument()
    expect(within(pager).getByRole('button', { name: 'shareCard.download' })).toHaveAttribute('data-variant', 'primary')
  })

  it('hands the composed image to the platform share sheet', () => {
    renderPlayer()
    advanceToLastSlide()

    fireEvent.click(within(screen.getByTestId('wrapped-pager')).getByRole('button', { name: 'shareCard.share' }))
    expect(shareCardMock.share).toHaveBeenCalledWith({
      shareTitle: 'shareCard.shareTitle',
      shareText: 'shareCard.shareText',
      url: 'https://app.useorbit.org/r/ABC123?recap=week',
    })
  })

  it('responds to ArrowRight / ArrowLeft and closes on Escape', () => {
    const { onClose } = renderPlayer()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps a queued action inside the active player above its pager', async () => {
    const reload = vi.fn()
    renderPlayer(vi.fn(), <AppToastHost />)
    act(() => { useAppToastStore.getState().showQueued('App updated', 'Reload', reload) })

    await screen.findByText('App updated')
    const dialog = screen.getByRole('dialog', { name: 'wrapped.title' })
    const notice = dialog.querySelector('[data-shell-notice]')
    expect(notice?.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    expect(notice?.nextElementSibling).toHaveAttribute('data-testid', 'wrapped-pager')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('omits the standout slide when there are no top habits', () => {
    const recap = createMockRecap({
      metrics: createMockRetrospectiveMetrics({ topHabits: [] }),
    })
    const slides = buildWrappedSlides(recap)
    render(
      <WrappedPlayer slides={slides} recap={recap} period="month" onClose={vi.fn()} />,
    )

    expect(screen.queryByTestId('wrapped-slide-topHabit')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('wrapped-pager')).getAllByRole('listitem')).toHaveLength(7)
  })
})
