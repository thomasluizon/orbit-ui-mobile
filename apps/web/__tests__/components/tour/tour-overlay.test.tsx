import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const nextStep = vi.fn()
const prevStep = vi.fn()
const endTour = vi.fn()
const setQueryData = vi.fn()
const completeTour = vi.fn()

const mocks = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  staticState: { replaySection: null as string | null, isCoachTour: false },
}))

vi.mock('@/stores/tour-store', () => ({
  useTourStore: Object.assign(() => mocks.store, { getState: () => mocks.staticState }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData }) }))
vi.mock('@/app/actions/profile', () => ({ completeTour: () => completeTour() }))
vi.mock('@/hooks/use-overlay-escape', () => ({ useOverlayEscape: () => {} }))
vi.mock('@/components/tour/tour-spotlight', () => ({ TourSpotlight: () => <div data-testid="spotlight" /> }))
vi.mock('@/components/tour/tour-tooltip', () => ({
  TourTooltip: ({ onNext, onPrev, onSkip }: { onNext: () => void; onPrev: () => void; onSkip: () => void }) => (
    <div data-testid="tooltip">
      <button type="button" aria-label="next" onClick={onNext} />
      <button type="button" aria-label="prev" onClick={onPrev} />
      <button type="button" aria-label="skip" onClick={onSkip} />
    </div>
  ),
}))

import { TourOverlay } from '@/components/tour/tour-overlay'

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    isActive: true,
    isNavigating: false,
    targetRect: { x: 0, y: 0, width: 10, height: 10 },
    getCurrentStep: () => ({ id: 'step-1' }),
    getSectionProgress: () => ({ current: 1, total: 3 }),
    getTotalSteps: () => 3,
    currentStepIndex: 0,
    nextStep,
    prevStep,
    endTour,
    ...overrides,
  }
}

describe('TourOverlay', () => {
  beforeEach(() => {
    nextStep.mockClear()
    prevStep.mockClear()
    endTour.mockClear()
    setQueryData.mockClear()
    completeTour.mockClear()
    completeTour.mockResolvedValue(undefined)
    localStorage.clear()
    mocks.store = makeStore()
    mocks.staticState = { replaySection: null, isCoachTour: false }
  })

  it('renders nothing while the tour is inactive', () => {
    mocks.store = makeStore({ isActive: false })
    const { container } = render(<TourOverlay />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the spotlight but withholds the tooltip while navigating', () => {
    mocks.store = makeStore({ isNavigating: true })
    render(<TourOverlay />)
    expect(screen.getByTestId('spotlight')).toBeInTheDocument()
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
  })

  it('advances to the next step when not on the last step', () => {
    render(<TourOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(nextStep).toHaveBeenCalledTimes(1)
    expect(endTour).not.toHaveBeenCalled()
  })

  it('completes the tour and persists progress on the final Next', async () => {
    mocks.store = makeStore({ currentStepIndex: 2 })
    render(<TourOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(endTour).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(completeTour).toHaveBeenCalledTimes(1))
    expect(setQueryData).toHaveBeenCalled()
    expect(localStorage.getItem('orbit_tour_sections:v1')).toContain('habits')
  })

  it('ends a coach tour without calling completeTour', () => {
    mocks.staticState = { replaySection: null, isCoachTour: true }
    render(<TourOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'skip' }))
    expect(endTour).toHaveBeenCalledTimes(1)
    expect(completeTour).not.toHaveBeenCalled()
  })
})
