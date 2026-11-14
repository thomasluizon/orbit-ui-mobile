import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { motionDurations } from '@orbit/shared/theme'
import { TodayAstraLine } from '@/components/today/today-astra-line'

let reducedMotion = false

function stubMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  })
}

beforeEach(() => { reducedMotion = false; stubMatchMedia(); enableTestFlags('orbit_guided_flows') })
afterEach(() => { reducedMotion = false })

describe('the root Orbit line row', () => {
  it('draws the live Orbit at 48 in the state the caller gives', () => {
    const { container } = render(<TodayAstraLine text="Nada marcado nesse dia." destination="Abrir conversa" mascotState="descansando" disabled />)
    const mascot = container.querySelector('[data-asset="orbit-mascot"]')!
    expect(mascot.getAttribute('width')).toBe('48')
    expect(mascot.getAttribute('data-orbit-face')).toBe('rig')
    expect(mascot.getAttribute('data-orbit-state')).toBe('descansando')
    expect(container.querySelector('button')).toHaveProperty('disabled', true)
  })

  it('fades a changed sentence in on the micro duration and never fades the first sentence', () => {
    const { container, rerender } = render(<TodayAstraLine text="Dia 2: tudo feito." destination="Abrir conversa" />)
    expect(container.querySelector('[data-sentence-change]')).toBeNull()
    rerender(<TodayAstraLine text="Nada marcado nesse dia." destination="Abrir conversa" />)
    const sentence = container.querySelector<HTMLElement>('[data-sentence-change]')!
    expect(sentence.textContent).toBe('Nada marcado nesse dia.')
    expect(sentence.style.animation).toContain(`${motionDurations.micro}ms`)
  })

  it('keeps the still sentence under reduced motion', () => {
    reducedMotion = true
    stubMatchMedia()
    const { container, rerender } = render(<TodayAstraLine text="Dia 2: tudo feito." destination="Abrir conversa" />)
    rerender(<TodayAstraLine text="Nada marcado nesse dia." destination="Abrir conversa" />)
    expect(container.querySelector('[data-sentence-change]')).toBeNull()
    expect(container.textContent).toContain('Nada marcado nesse dia.')
    expect(container.querySelector('[data-asset="orbit-mascot"]')?.getAttribute('data-orbit-loop')).toBe('still')
  })
})
