import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackLabel } from '@/hooks/use-back-label'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { clearAppNavigationHistory, updateAppNavigationHistory } from '@/lib/app-navigation-history'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { destination: string }) => values ? `${key}:${values.destination}` : key }))
const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

function Header({ fallback = '/profile' }: { fallback?: string }) {
  const label = useBackLabel(fallback)
  const goBackOrFallback = useGoBackOrFallback()
  return <button aria-label={label} onClick={() => goBackOrFallback(fallback)} />
}

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  history.replaceState({}, '', '/upgrade')
  Object.defineProperty(document, 'referrer', { configurable: true, value: '' })
  Object.defineProperty(history, 'length', { configurable: true, value: 1 })
})

describe('useBackLabel', () => {
  it('uses a generic label after reload when the referrer is not the previous history entry', () => {
    Object.defineProperty(document, 'referrer', { configurable: true, value: `${location.origin}/login` })
    Object.defineProperty(history, 'length', { configurable: true, value: 3 })
    updateAppNavigationHistory('/calendar', 'init')
    updateAppNavigationHistory('/upgrade', 'push')
    render(<Header />)
    expect(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' })).toBeInTheDocument()
    act(() => updateAppNavigationHistory('/upgrade', 'init'))
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }))
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('keeps the source name before and after the tracker records the push', () => {
    updateAppNavigationHistory('/calendar?view=month', 'init')
    render(<Header />)
    expect(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' }))
    expect(router.back).toHaveBeenCalledTimes(1)
    act(() => updateAppNavigationHistory('/upgrade', 'push'))
    expect(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.backToDestination:nav.calendar' }))
    expect(router.back).toHaveBeenCalledTimes(2)
    expect(router.replace).not.toHaveBeenCalled()
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
    { referrer: `${location.origin}/about`, length: 2, label: 'common.back' },
    { referrer: `${location.origin}/about`, length: 1, label: 'common.backToProfile' },
    { referrer: 'https://outside.example/about', length: 2, label: 'common.backToProfile' },
    { referrer: 'invalid', length: 2, label: 'common.backToProfile' },
  ])('uses a generic history label or the fallback: $referrer, $length', ({ referrer, length, label }) => {
    Object.defineProperty(document, 'referrer', { configurable: true, value: referrer })
    Object.defineProperty(history, 'length', { configurable: true, value: length })
    render(<Header />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    if (label === 'common.back') {
      expect(router.back).toHaveBeenCalledTimes(1)
      expect(router.replace).not.toHaveBeenCalled()
    } else {
      expect(router.replace).toHaveBeenCalledWith('/profile')
      expect(router.back).not.toHaveBeenCalled()
    }
    expect(router.push).not.toHaveBeenCalled()
  })
})
