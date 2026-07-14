import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { TourStep, TourSection } from '@orbit/shared/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
}))
vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: ({ label }: { label: string }) => <span data-testid="pro-badge">{label}</span>,
}))

import { TourTooltip } from '@/components/tour/tour-tooltip'

function makeStep(overrides: Partial<TourStep> = {}): TourStep {
  return {
    id: 'step-1',
    section: 'habits',
    targetId: 'tour-habits',
    titleKey: 'tour.steps.habits.title',
    descriptionKey: 'tour.steps.habits.desc',
    placement: 'bottom',
    route: '/',
    ...overrides,
  }
}

function renderTooltip(props: Partial<React.ComponentProps<typeof TourTooltip>> = {}) {
  const dialogRef = React.createRef<HTMLDialogElement>()
  const merged = {
    step: makeStep(),
    targetRect: { x: 100, y: 100, width: 40, height: 20 },
    sectionProgress: { current: 1, total: 3, section: 'habits' as TourSection | null },
    isFirstStep: true,
    isLastStep: false,
    dialogRef,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    ...props,
  }
  render(<TourTooltip {...merged} />)
  return merged
}

async function flushFrame() {
  await act(async () => {
    await new Promise<number>((resolve) => requestAnimationFrame(resolve))
  })
}

describe('TourTooltip', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  it('hides the Back button on the first step and labels Next', () => {
    renderTooltip({ isFirstStep: true, isLastStep: false })
    expect(screen.queryByRole('button', { name: 'tour.ui.back' })).not.toBeInTheDocument()
    expect(screen.getByText('tour.ui.next')).toBeInTheDocument()
  })

  it('shows Back and a Finish label on the last step', () => {
    renderTooltip({ isFirstStep: false, isLastStep: true })
    expect(screen.getByRole('button', { name: 'tour.ui.back' })).toBeInTheDocument()
    expect(screen.getByText('tour.ui.finish')).toBeInTheDocument()
  })

  it('wires the navigation callbacks', () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    const onSkip = vi.fn()
    renderTooltip({ isFirstStep: false, onNext, onPrev, onSkip })
    fireEvent.click(screen.getByText('tour.ui.next'))
    fireEvent.click(screen.getByRole('button', { name: 'tour.ui.back' }))
    fireEvent.click(screen.getByText('tour.ui.skip'))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('renders one progress dot per section step and the step counter', () => {
    renderTooltip({ sectionProgress: { current: 2, total: 4, section: 'habits' } })
    const dialog = screen.getByRole('dialog')
    const dots = dialog.querySelectorAll('div.h-2.w-4')
    expect(dots).toHaveLength(4)
    expect(screen.getByText('tour.ui.stepOf({"current":2,"total":4})')).toBeInTheDocument()
  })

  it('shows the Pro badge only when the step is gated', () => {
    renderTooltip({ step: makeStep({ proBadge: true }) })
    expect(screen.getByTestId('pro-badge')).toBeInTheDocument()
  })

  it('computes a floating desktop placement after the layout frame', async () => {
    renderTooltip({ step: makeStep({ placement: 'right' }) })
    await flushFrame()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('falls back to a bottom sheet on narrow viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 480, configurable: true })
    renderTooltip({ targetRect: { x: 0, y: 10, width: 20, height: 20 } })
    await flushFrame()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
