import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { BackToTop } from '@/components/ui/back-to-top'
import { useUIStore } from '@/stores/ui-store'
import { Shell412 } from '@/components/shell/shell-412'
import { ShellScrollerProvider } from '@/components/shell/shell-scroller-context'

let observerCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null

vi.stubGlobal(
  'IntersectionObserver',
  class {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      observerCallback = callback
    }

    observe() {
      observerCallback?.([{ isIntersecting: true }])
    }

    disconnect() {}
  },
)

function renderBackToTop() {
  const view = render(
    <ShellScrollerProvider>
      <Shell412 tabBar={<div>Tabs</div>}><div>Today</div></Shell412>
      <BackToTop />
    </ShellScrollerProvider>,
  )
  const scroller = view.container.querySelector<HTMLElement>('[data-shell-scroller]')
  if (!scroller) throw new Error('Expected the shell scroller')
  scroller.scrollTo = vi.fn()
  return { ...view, scroller }
}

describe('BackToTop', () => {
  beforeEach(() => {
    useUIStore.setState({ isSelectMode: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays hidden until the shell scroller passes the threshold', () => {
    renderBackToTop()
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')

    act(() => observerCallback?.([{ isIntersecting: false }]))

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')
  })

  it('scrolls the shell back to the top when pressed', () => {
    const { scroller } = renderBackToTop()
    act(() => observerCallback?.([{ isIntersecting: false }]))
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')

    fireEvent.click(screen.getByTestId('back-to-top'))

    expect(scroller.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    )
  })

  it('stays hidden while multi-select is active even when scrolled', () => {
    useUIStore.setState({ isSelectMode: true })
    renderBackToTop()
    act(() => observerCallback?.([{ isIntersecting: false }]))

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')
  })
})
