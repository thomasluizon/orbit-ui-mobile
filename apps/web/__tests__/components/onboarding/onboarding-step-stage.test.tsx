import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { OnboardingStepStage } from '@/components/onboarding/onboarding-step-stage'

const mocks = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: () => mocks.reduced }))
vi.mock('motion/react', async () => {
  const React = await import('react')
  return { domMin: {}, LazyMotion: ({ children }: { children: React.ReactNode }) => children }
})
vi.mock('motion/react-m', async () => {
  const React = await import('react')
  return { div: ({ children, className, initial, animate }: { children: React.ReactNode; className?: string; initial?: unknown; animate?: unknown }) =>
    React.createElement('div', { className, 'data-initial': JSON.stringify(initial), 'data-animate': JSON.stringify(animate) }, children) }
})

function readStage(container: HTMLElement) {
  const stage = container.firstElementChild!
  return { initial: JSON.parse(stage.getAttribute('data-initial')!) as unknown, animate: JSON.parse(stage.getAttribute('data-animate')!) as { transition: { duration: number; ease: number[] } } }
}

describe('OnboardingStepStage', () => {
  beforeEach(() => { mocks.reduced = false })

  it('does not animate the step that opens the flow', () => {
    const { container } = render(<OnboardingStepStage step={0}>body</OnboardingStepStage>)
    expect(readStage(container).initial).toBe(false)
  })

  it('enters a changed step with the shared shift, base duration and enter easing', () => {
    const { container, rerender } = render(<OnboardingStepStage step={0}>one</OnboardingStepStage>)
    rerender(<OnboardingStepStage step={1}>two</OnboardingStepStage>)
    const { initial, animate } = readStage(container)
    expect(initial).toEqual({ opacity: 0, y: motionLayerTiming.routeShift })
    expect(animate.transition.duration).toBe(motionDurations.base / 1000)
    expect(animate.transition.ease).toEqual([...motionEasings.enter])
  })

  it('takes the duration and the curve from the shared tokens', () => {
    const durations = motionDurations as unknown as Record<string, number>
    const easings = motionEasings as unknown as Record<string, readonly number[]>
    const originalBase = durations.base
    const originalEnter = easings.enter
    durations.base = 333
    easings.enter = [0.1, 0.2, 0.3, 0.4]
    try {
      const { container, rerender } = render(<OnboardingStepStage step={0}>one</OnboardingStepStage>)
      rerender(<OnboardingStepStage step={1}>two</OnboardingStepStage>)
      const { transition } = readStage(container).animate
      expect(transition.duration).toBeCloseTo(0.333, 5)
      expect(transition.ease).toEqual([0.1, 0.2, 0.3, 0.4])
    } finally {
      durations.base = originalBase!
      easings.enter = originalEnter!
    }
  })

  it('enters again when the person returns to the first step', () => {
    const { container, rerender } = render(<OnboardingStepStage step={0}>one</OnboardingStepStage>)
    rerender(<OnboardingStepStage step={1}>two</OnboardingStepStage>)
    rerender(<OnboardingStepStage step={0}>one</OnboardingStepStage>)
    expect(readStage(container).initial).toEqual({ opacity: 0, y: motionLayerTiming.routeShift })
  })

  it('changes at once under reduced motion', () => {
    mocks.reduced = true
    const { container, rerender } = render(<OnboardingStepStage step={0}>one</OnboardingStepStage>)
    rerender(<OnboardingStepStage step={1}>two</OnboardingStepStage>)
    const { initial, animate } = readStage(container)
    expect(initial).toBe(false)
    expect(animate.transition.duration).toBe(0)
  })
})
