import { act, render } from '@testing-library/react'
import { ORBIT_MASCOT_VIEW_BOX, ORBIT_SMALL_FACES, orbitMascotFrame, orbitOutlineCutout } from '@orbit/shared/contracts/brand'
import { mascotMotion } from '@orbit/shared/theme'
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

/** The vertical scale of the eyes: 1 is open, and the blink closes them toward 0.1. */
function eyeScaleOf(container: HTMLElement) {
  const transform = container.querySelector('[data-part="eye"]')?.getAttribute('transform') ?? ''
  return Number(/^matrix\(1 0 0 ([\d.]+) /.exec(transform)?.[1])
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
    act(() => { vi.advanceTimersByTime(48) })
    const drawn = moonOf(container)
    expect(drawn).not.toBe(rest)
    act(() => { vi.advanceTimersByTime(16) })
    expect(moonOf(container)).toBe(drawn)
    act(() => { vi.advanceTimersByTime(32) })
    expect(moonOf(container)).not.toBe(drawn)
  })

  it.each([
    ['Orbit em movimento turns off', () => setOrbitMotionEnabled(false)],
    ['the mascot goes off screen', () => observers.at(-1)?.([{ isIntersecting: false }])],
  ])('opens its eyes when %s in the middle of a blink', (_cause, pause) => {
    const { container } = render(<OrbitMascot size={96} />)
    for (let step = 0; step < 100 && eyeScaleOf(container) >= 0.5; step += 1) act(() => { vi.advanceTimersByTime(48) })
    expect(eyeScaleOf(container)).toBeLessThan(0.5)
    act(() => { pause() })
    expect(loopOf(container)).toBe('still')
    expect(eyeScaleOf(container)).toBe(1)
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

  it('gives the live slot to the next Orbit in view while the first one is off screen', () => {
    const { container } = render(<><OrbitMascot size={48} /><OrbitMascot size={96} /></>)
    expect([loopOf(container, 0), loopOf(container, 1)]).toEqual(['running', 'still'])
    act(() => { observers[0]?.([{ isIntersecting: false }]) })
    expect([loopOf(container, 0), loopOf(container, 1)]).toEqual(['still', 'running'])
  })

  it('lets the conversation entry lead the view when it returns after another Orbit', () => {
    const { container, rerender } = render(<><OrbitMascot size={96} />{null}</>)
    rerender(<><OrbitMascot size={96} /><OrbitMascot size={48} lead /></>)
    expect([loopOf(container, 0), loopOf(container, 1)]).toEqual(['still', 'running'])
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

describe('Orbit ring outline on web', () => {
  it('cuts the outline out of the planet, so the surface behind shows through on any fill', () => {
    const { container } = render(<div><OrbitMascot size={96} /><OrbitMascot size={16} /></div>)
    const cutouts = [...container.querySelectorAll('[data-part="outline-cutout"]')]
    expect(cutouts.map((path) => path.getAttribute('clip-rule'))).toEqual(['evenodd', 'evenodd'])
    expect(cutouts[0]?.getAttribute('d')).toBe(orbitOutlineCutout(ORBIT_MASCOT_VIEW_BOX, orbitMascotFrame(0, mascotMotion).ringOutline))
    expect(cutouts[1]?.getAttribute('d')).toBe(orbitOutlineCutout(ORBIT_SMALL_FACES[16].viewBox, ORBIT_SMALL_FACES[16].ringOutline))
    const planets = [...container.querySelectorAll('[data-part="planet"]')]
    expect(planets.map((group) => group.getAttribute('clip-path'))).toEqual(cutouts.map((path) => `url(#${path.parentElement?.id})`))
    expect(container.innerHTML).not.toContain('orbit-surface')
    expect([...container.querySelectorAll('[fill="var(--bg)"]')].every((node) => node.getAttribute('data-part') === 'eye')).toBe(true)
  })
})
