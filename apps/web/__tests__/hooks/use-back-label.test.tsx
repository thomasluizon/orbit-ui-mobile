import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackLabel } from '@/hooks/use-back-label'
import { clearAppNavigationHistory, updateAppNavigationHistory } from '@/lib/app-navigation-history'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { destination: string }) => values ? `${key}:${values.destination}` : key }))

function Header({ fallback = '/profile' }: { fallback?: string }) {
  const label = useBackLabel(fallback)
  return <button aria-label={label} />
}

beforeEach(() => {
  sessionStorage.clear()
  history.replaceState({}, '', '/upgrade')
  Object.defineProperty(document, 'referrer', { configurable: true, value: '' })
  Object.defineProperty(history, 'length', { configurable: true, value: 1 })
})

describe('useBackLabel', () => {
  it('keeps the source name before and after the tracker records the push', () => {
    updateAppNavigationHistory('/calendar?view=month', 'init')
    render(<Header />)
    expect(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' })).toBeInTheDocument()
    act(() => updateAppNavigationHistory('/upgrade', 'push'))
    expect(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' })).toBeInTheDocument()
  })

  it('refreshes the name when history resets on a direct load or account change', () => {
    updateAppNavigationHistory('/calendar', 'init')
    updateAppNavigationHistory('/upgrade', 'push')
    render(<Header />)
    act(() => updateAppNavigationHistory('/upgrade', 'init'))
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
    act(() => clearAppNavigationHistory())
    expect(screen.getByRole('button', { name: 'common.backToProfile' })).toBeInTheDocument()
  })

  it.each([
    { referrer: `${location.origin}/about`, length: 2, label: 'common.backToDestination:about.title' },
    { referrer: `${location.origin}/about`, length: 1, label: 'common.backToProfile' },
    { referrer: 'https://outside.example/about', length: 2, label: 'common.backToProfile' },
    { referrer: 'invalid', length: 2, label: 'common.backToProfile' },
  ])('names the referrer only when back navigation can use it: $referrer, $length', ({ referrer, length, label }) => {
    Object.defineProperty(document, 'referrer', { configurable: true, value: referrer })
    Object.defineProperty(history, 'length', { configurable: true, value: length })
    render(<Header />)
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })
})
