import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrbitHop } from '@/components/ui/orbit-hop'

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {},
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('the one hop of Orbit', () => {
  it('hops when it is active and hides its content from assistive technology', () => {
    stubReducedMotion(false)
    const { container } = render(<OrbitHop active><svg /></OrbitHop>)
    const carrier = container.querySelector('[data-orbit-hop]')!
    expect(carrier.getAttribute('data-orbit-hop')).toBe('play')
    expect(carrier.getAttribute('aria-hidden')).toBe('true')
    expect(carrier.querySelector('svg')).not.toBeNull()
  })

  it('stays still when it is not active', () => {
    stubReducedMotion(false)
    const { container } = render(<OrbitHop active={false}><svg /></OrbitHop>)
    expect(container.querySelector('[data-orbit-hop]')!.getAttribute('data-orbit-hop')).toBe('still')
  })

  it('stays still under reduced motion', () => {
    stubReducedMotion(true)
    const { container } = render(<OrbitHop active><svg /></OrbitHop>)
    expect(container.querySelector('[data-orbit-hop]')!.getAttribute('data-orbit-hop')).toBe('still')
  })
})
