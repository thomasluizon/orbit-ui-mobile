import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let currentScrollY = 0
let scrollChangeHandler: ((value: number) => void) | undefined

vi.mock('motion/react', () => ({
  useScroll: () => ({ scrollY: { get: () => currentScrollY } }),
  useMotionValueEvent: (
    _value: unknown,
    _event: string,
    handler: (value: number) => void,
  ) => {
    scrollChangeHandler = handler
  },
}))

import { BackToTop } from '@/components/ui/back-to-top'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'

function scrollTo(value: number) {
  currentScrollY = value
  act(() => {
    scrollChangeHandler?.(value)
  })
}

describe('BackToTop', () => {
  beforeEach(() => {
    currentScrollY = 0
    scrollChangeHandler = undefined
    useShellStore.setState({ astraOpen: false })
    useUIStore.setState({ isSelectMode: false })
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    currentScrollY = 0
  })

  it('stays hidden until the page is scrolled past the threshold', () => {
    render(<BackToTop />)
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')

    scrollTo(700)

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')
  })

  it('scrolls the window back to the top when pressed', () => {
    render(<BackToTop />)
    scrollTo(700)
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')

    fireEvent.click(screen.getByTestId('back-to-top'))

    expect(window.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    )
  })

  it('stays hidden while multi-select is active even when scrolled', () => {
    useUIStore.setState({ isSelectMode: true })
    render(<BackToTop />)
    scrollTo(700)

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')
  })

  it('stays hidden while the Astra copilot is expanded', () => {
    useShellStore.setState({ astraOpen: true })
    render(<BackToTop />)
    scrollTo(700)

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')
  })
})
