import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { BackToTop } from '@/components/ui/back-to-top'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value })
}

describe('BackToTop', () => {
  beforeEach(() => {
    setScrollY(0)
    useShellStore.setState({ astraOpen: false })
    useUIStore.setState({ isSelectMode: false })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setScrollY(0)
  })

  it('stays hidden until the page is scrolled past the threshold', () => {
    render(<BackToTop />)
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')

    act(() => {
      setScrollY(700)
      window.dispatchEvent(new Event('scroll'))
    })

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')
  })

  it('scrolls the window back to the top when pressed', () => {
    setScrollY(700)
    render(<BackToTop />)
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')

    fireEvent.click(screen.getByTestId('back-to-top'))

    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    )
  })

  it('stays hidden while multi-select is active even when scrolled', () => {
    useUIStore.setState({ isSelectMode: true })
    setScrollY(700)
    render(<BackToTop />)

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')
  })

  it('stays hidden while the Astra copilot is expanded', () => {
    useShellStore.setState({ astraOpen: true })
    setScrollY(700)
    render(<BackToTop />)

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')
  })
})
