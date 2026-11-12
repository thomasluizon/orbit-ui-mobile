import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { resolveMotionPreset, type ResolvedMotionPreset } from '@orbit/shared/theme'
import { LoginStepStage } from '@/app/(auth)/login/login-sections'

vi.mock('motion/react', async () => {
  const React = await import('react')
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children }
})
vi.mock('motion/react-m', async () => {
  const React = await import('react')
  return { div: ({ children, initial, animate, exit }: { children: React.ReactNode; initial?: unknown; animate?: unknown; exit?: unknown }) =>
    React.createElement('div', { 'data-initial': JSON.stringify(initial), 'data-animate': JSON.stringify(animate), 'data-exit': JSON.stringify(exit) }, children) }
})

function readStage(step: string, motionPreset: ResolvedMotionPreset) {
  const { container } = render(<LoginStepStage step={step} motionPreset={motionPreset}>body</LoginStepStage>)
  const stage = container.firstElementChild!
  const read = (name: string) => JSON.parse(stage.getAttribute(name)!) as { x: number; transition?: { duration: number; ease: number[] } }
  return { initial: read('data-initial'), animate: read('data-animate'), exit: read('data-exit') }
}

describe('LoginStepStage motion', () => {
  const preset: ResolvedMotionPreset = {
    ...resolveMotionPreset('route-replace', false),
    enterDuration: 300, exitDuration: 200, enterEasing: [0.1, 0.2, 0.3, 0.4], exitEasing: [0.5, 0.6, 0.7, 0.8], shift: 20,
  }

  it('takes the leg duration, easing and shift from the shared preset', () => {
    const { initial, animate, exit } = readStage('code', preset)
    expect(animate.transition?.duration).toBeCloseTo(0.15, 5)
    expect(exit.transition?.duration).toBeCloseTo(0.1, 5)
    expect(animate.transition?.ease).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(exit.transition?.ease).toEqual([0.5, 0.6, 0.7, 0.8])
    expect(initial.x).toBe(20)
    expect(exit.x).toBe(20)
  })

  it('shifts the email step the other way', () => {
    expect(readStage('email', preset).initial.x).toBe(-20)
  })

  it('moves nothing under reduced motion', () => {
    const { initial, animate, exit } = readStage('code', { ...preset, reducedMotionEnabled: true })
    expect(animate.transition?.duration).toBe(0)
    expect(exit.transition?.duration).toBe(0)
    expect(initial.x).toBe(0)
    expect(exit.x).toBe(0)
  })
})
