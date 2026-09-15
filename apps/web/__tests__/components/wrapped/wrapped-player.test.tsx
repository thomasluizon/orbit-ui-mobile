import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
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

function renderPlayer(onClose = vi.fn()) {
  const recap = createMockRecap()
  const slides = buildWrappedSlides(recap)
  render(
    <WrappedPlayer
      slides={slides}
      recap={recap}
      period="week"
      onClose={onClose}
    />,
  )
  return { onClose, slides }
}

function advanceToLastSlide() {
  const lastIndex = buildWrappedSlides(createMockRecap()).length - 1
  for (let step = 0; step < lastIndex; step += 1) {
    fireEvent.click(screen.getByTestId('wrapped-next-zone'))
  }
}

describe('WrappedPlayer', () => {
  beforeEach(() => {
    shareCardMock.isSharing = false
    shareCardMock.hasError = false
    shareCardMock.canShareFiles = true
    shareCardMock.share.mockReset()
    shareCardMock.download.mockReset()
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

  it('pages forward and back through the Pager controls', () => {
    renderPlayer()
    const pager = screen.getByTestId('wrapped-pager')
    fireEvent.click(within(pager).getByRole('button', { name: 'wrapped.next' }))
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()
    fireEvent.click(within(pager).getByRole('button', { name: 'wrapped.previous' }))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
  })

  it('pages through the transparent tap zones', () => {
    renderPlayer()
    const previousZone = screen.getByTestId('wrapped-previous-zone')
    expect(previousZone).toBeDisabled()
    expect(previousZone).toHaveAttribute('tabindex', '-1')
    fireEvent.click(screen.getByTestId('wrapped-next-zone'))
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('wrapped-previous-zone'))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
  })

  it('replaces the Pager forward control with responsive share actions on the final slide', () => {
    renderPlayer()
    advanceToLastSlide()
    const pager = screen.getByTestId('wrapped-pager')
    expect(within(pager).queryByRole('button', { name: 'wrapped.next' })).not.toBeInTheDocument()
    const narrowActions = within(pager).getByTestId('wrapped-share-actions-narrow')
    const wideActions = within(pager).getByTestId('wrapped-share-actions-wide')
    const controls = within(pager).getByRole('button', { name: 'wrapped.previous' }).parentElement
    expect(narrowActions).toHaveClass('flex', 'flex-col', 'items-stretch', 'sm:hidden')
    expect(wideActions).toHaveClass('hidden', 'items-center', 'sm:flex')
    expect(controls).toHaveClass(
      'flex',
      'flex-col',
      'items-stretch',
      'sm:flex-row',
      'sm:items-center',
      'sm:justify-between',
    )
    expect(within(narrowActions).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['shareCard.share', 'shareCard.download'])
    expect(within(wideActions).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['shareCard.download', 'shareCard.share'])
    expect(within(narrowActions).getByRole('button', { name: 'shareCard.share' })).toHaveAttribute('data-variant', 'primary')
    expect(within(narrowActions).getByRole('button', { name: 'shareCard.download' })).toHaveAttribute('data-variant', 'ghost')
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

    const narrowActions = within(screen.getByTestId('wrapped-pager'))
      .getByTestId('wrapped-share-actions-narrow')
    fireEvent.click(within(narrowActions).getByRole('button', { name: 'shareCard.share' }))
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
