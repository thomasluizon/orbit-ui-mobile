import { act, render } from '@testing-library/react'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'

const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = []

class IntersectionObserverDouble {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observers.push(callback)
  }
  observe() {}
  disconnect() {}
}

function loopOf(container: HTMLElement, index = 0) {
  return container.querySelectorAll('svg')[index]?.getAttribute('data-orbit-loop')
}

function moonOf(container: HTMLElement) {
  const moon = container.querySelector('[data-part="moon"]')
  return `${moon?.getAttribute('cx')},${moon?.getAttribute('cy')}`
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  observers.length = 0
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] })
  vi.stubGlobal('IntersectionObserver', IntersectionObserverDouble)
  setReducedMotion(false)
})

afterEach(() => {
  setOrbitMotionEnabled(undefined)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Orbit idle loop on web', () => {
  it('draws at most one frame in 33ms and moves the moon', () => {
    const { container } = render(<OrbitMascot size={96} />)
    expect(loopOf(container)).toBe('running')
    const rest = moonOf(container)
    act(() => { vi.advanceTimersByTime(20) })
    expect(moonOf(container)).toBe(rest)
    act(() => { vi.advanceTimersByTime(400) })
    expect(moonOf(container)).not.toBe(rest)
  })

  it('stays still and draws the rest frame under reduced motion', () => {
    setReducedMotion(true)
    const { container } = render(<OrbitMascot size={96} />)
    const rest = moonOf(container)
    act(() => { vi.advanceTimersByTime(400) })
    expect(loopOf(container)).toBe('still')
    expect(moonOf(container)).toBe(rest)
  })

  it('swaps the face at once under reduced motion', () => {
    setReducedMotion(true)
    const { container, rerender } = render(<OrbitMascot size={96} state="parado" />)
    rerender(<OrbitMascot size={96} state="descansando" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-orbit-state', 'descansando')
  })

  it('pauses off screen and resumes on screen', () => {
    const { container } = render(<OrbitMascot size={96} />)
    act(() => { observers.at(-1)?.([{ isIntersecting: false }]) })
    expect(loopOf(container)).toBe('still')
    act(() => { observers.at(-1)?.([{ isIntersecting: true }]) })
    expect(loopOf(container)).toBe('running')
  })

  it('pauses while the tab is in the background and resumes in the foreground', () => {
    const { container } = render(<OrbitMascot size={96} />)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(loopOf(container)).toBe('still')
    visibility.mockReturnValue('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(loopOf(container)).toBe('running')
  })

  it('pauses under an open overlay, runs inside it, and resumes when it closes', () => {
    const { container, rerender } = render(<><OrbitMascot size={96} /><OrbitOverlayLayer active={false}><OrbitMascot size={48} /></OrbitOverlayLayer></>)
    expect(loopOf(container, 0)).toBe('running')
    rerender(<><OrbitMascot size={96} /><OrbitOverlayLayer active><OrbitMascot size={48} /></OrbitOverlayLayer></>)
    expect(loopOf(container, 0)).toBe('still')
    expect(loopOf(container, 1)).toBe('running')
    rerender(<><OrbitMascot size={96} /><OrbitOverlayLayer active={false}>{null}</OrbitOverlayLayer></>)
    expect(loopOf(container, 0)).toBe('running')
  })

  it('runs one live Orbit per view and keeps a still Orbit inside a control', () => {
    const { container } = render(<><OrbitMascot size={96} /><OrbitMascot size={48} /><button type="button"><OrbitMascot size={48} still /></button></>)
    expect([loopOf(container, 0), loopOf(container, 1), loopOf(container, 2)]).toEqual(['running', 'still', 'still'])
  })

  it('stops every loop when Orbit em movimento is off', () => {
    const { container } = render(<OrbitMascot size={96} />)
    act(() => setOrbitMotionEnabled(false))
    expect(loopOf(container)).toBe('still')
  })

  it('cancels its frame when it unmounts', () => {
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const { unmount } = render(<OrbitMascot size={96} />)
    unmount()
    expect(cancel).toHaveBeenCalled()
  })
})
