import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createMockRecap, createMockRetrospectiveMetrics } from '@orbit/shared/__tests__/factories'
import { buildWrappedSlides } from '@orbit/shared/utils'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

vi.mock('@/components/share/share-card-qr', () => ({
  ShareCardQr: () => null,
}))

vi.mock('@/hooks/use-share-card', () => ({
  useShareCard: () => ({
    captureRef: { current: null },
    isSharing: false,
    hasError: false,
    canShareFiles: false,
    share: vi.fn(),
    download: vi.fn(),
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
      displayName="Ada"
      onClose={onClose}
    />,
  )
  return { onClose, slides }
}

describe('WrappedPlayer', () => {
  it('opens on the intro slide and renders one progress segment per slide', () => {
    const { slides } = renderPlayer()
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-progress').children).toHaveLength(slides.length)
  })

  it('advances through every slide and ends on the share card', () => {
    const { slides } = renderPlayer()
    const order = slides.map((slide) => slide.id)

    order.slice(1).forEach((id) => {
      fireEvent.click(screen.getByLabelText('wrapped.next'))
      expect(screen.getByTestId(`wrapped-slide-${id}`)).toBeInTheDocument()
    })

    expect(screen.getByTestId('wrapped-slide-share')).toBeInTheDocument()
  })

  it('swaps the tap zones for a header previous control and the share CTA on the final slide', () => {
    renderPlayer()
    const lastIndex = buildWrappedSlides(createMockRecap()).length - 1
    for (let step = 0; step < lastIndex; step += 1) {
      fireEvent.click(screen.getByLabelText('wrapped.next'))
    }
    expect(screen.queryByLabelText('wrapped.next')).not.toBeInTheDocument()
    expect(screen.getByLabelText('wrapped.previous')).toBeInTheDocument()
    expect(screen.getByText('shareCard.download')).toBeInTheDocument()
  })

  it('steps back from the last slide with the header previous control', () => {
    renderPlayer()
    const slides = buildWrappedSlides(createMockRecap())
    const lastIndex = slides.length - 1
    for (let step = 0; step < lastIndex; step += 1) {
      fireEvent.click(screen.getByLabelText('wrapped.next'))
    }
    expect(screen.getByTestId('wrapped-slide-share')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('wrapped.previous'))
    expect(screen.getByTestId(`wrapped-slide-${slides[lastIndex - 1]!.id}`)).toBeInTheDocument()
  })

  it('steps backward with the previous zone and clamps at the first slide', () => {
    renderPlayer()
    fireEvent.click(screen.getByLabelText('wrapped.next'))
    expect(screen.getByTestId('wrapped-slide-completions')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('wrapped.previous'))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('wrapped.previous'))
    expect(screen.getByTestId('wrapped-slide-intro')).toBeInTheDocument()
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
    expect(screen.getByTestId('wrapped-progress').children).toHaveLength(6)
  })
})
