import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HabitListEmptyState } from '@/components/habits/habit-list/empty-state'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

function setWidth(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const minimum = /min-width:\s*(\d+)px/.exec(query)
    return { matches: minimum ? width >= Number(minimum[1]) : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }
  })
}

afterEach(() => { vi.unstubAllGlobals() })

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
