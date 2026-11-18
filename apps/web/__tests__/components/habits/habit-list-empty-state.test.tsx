import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HabitListAllDone, HabitListEmptyState } from '@/components/habits/habit-list/empty-state'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

function setWidth(width: number, reducedMotion = false) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const minimum = /min-width:\s*(\d+)px/.exec(query)
    const matches = minimum ? width >= Number(minimum[1]) : reducedMotion && query.includes('prefers-reduced-motion')
    return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  useUIStore.setState({ activeCelebration: null, queuedCelebrations: [], allDoneCelebration: false })
})

describe('the completed day on web', () => {
  const mark = () => document.querySelector<HTMLElement>('[data-testid="completed-day-mark"]')!

  it.each([[320, 96], [1023, 96], [1024, 128], [1440, 128]])('draws Orbit in Feliz at the state size at %ipx', (width, size) => {
    setWidth(width)
    render(<HabitListAllDone />)
    const mascot = mark().querySelector('[data-asset="orbit-mascot"]')!
    expect(mascot.getAttribute('width')).toBe(String(size))
    expect(mascot.getAttribute('data-orbit-state')).toBe('feliz')
    expect(mark().style.width).toBe(`${size}px`)
  })

  it('hops once when everything due today is done, and stays still on a later visit', () => {
    setWidth(412)
    const view = render(<HabitListAllDone />)
    expect(mark().querySelector('[data-orbit-hop]')).toHaveAttribute('data-orbit-hop', 'still')
    act(() => { useUIStore.getState().enqueueCelebration('all-done', { count: 3 }) })
    expect(mark().querySelector('[data-orbit-hop]')).toHaveAttribute('data-orbit-hop', 'play')
    act(() => { useUIStore.getState().completeActiveCelebration() })
    view.unmount()
    render(<HabitListAllDone />)
    expect(mark().querySelector('[data-orbit-hop]')).toHaveAttribute('data-orbit-hop', 'still')
  })

  it('does not hop for another celebration or under reduced motion', () => {
    setWidth(412)
    act(() => { useUIStore.getState().enqueueCelebration('level-up', { level: 2 }) })
    const view = render(<HabitListAllDone />)
    expect(mark().querySelector('[data-orbit-hop]')).toHaveAttribute('data-orbit-hop', 'still')
    view.unmount()
    setWidth(412, true)
    act(() => { useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] }); useUIStore.getState().enqueueCelebration('all-done', { count: 3 }) })
    render(<HabitListAllDone />)
    expect(mark().querySelector('[data-orbit-hop]')).toHaveAttribute('data-orbit-hop', 'still')
  })
})

describe('the Hoje empty state actions on web', () => {
  it.each([
    [412, 'primary'],
    [1280, 'secondary'],
  ] as const)('pairs the quiet create action with a filled ask action at %ipx, and keeps Orbit off the fill', (width, filled) => {
    setWidth(width)
    render(<HabitListEmptyState title="No habits yet" description="" actionLabel="Create manually" onAction={vi.fn()} askAstraLabel="Ask Orbit" onAskAstra={vi.fn()} />)
    const create = screen.getByRole('button', { name: 'Create manually' })
    const ask = screen.getByRole('button', { name: 'Ask Orbit' })
    expect([create.getAttribute('data-variant'), ask.getAttribute('data-variant')]).toEqual(['ghost', filled])
    expect(ask.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })
})
