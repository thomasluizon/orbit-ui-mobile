import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { BackToTop } from '@/components/ui/back-to-top'
import { useUIStore } from '@/stores/ui-store'
import { Shell412 } from '@/components/shell/shell-412'
import { ShellScrollerProvider } from '@/components/shell/shell-scroller-context'

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

function setScrollTop(scroller: HTMLElement, value: number) {
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, value })
}

describe('BackToTop', () => {
  beforeEach(() => {
    useUIStore.setState({ isSelectMode: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stays hidden until the shell scroller passes the threshold', () => {
    const { scroller } = renderBackToTop()
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')

    act(() => {
      setScrollTop(scroller, 700)
      scroller.dispatchEvent(new Event('scroll'))
    })

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')
  })

  it('scrolls the shell back to the top when pressed', () => {
    const { scroller } = renderBackToTop()
    act(() => {
      setScrollTop(scroller, 700)
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'true')

    fireEvent.click(screen.getByTestId('back-to-top'))

    expect(scroller.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    )
  })

  it('stays hidden while multi-select is active even when scrolled', () => {
    useUIStore.setState({ isSelectMode: true })
    const { scroller } = renderBackToTop()
    act(() => {
      setScrollTop(scroller, 700)
      scroller.dispatchEvent(new Event('scroll'))
    })

    expect(screen.getByTestId('back-to-top')).toHaveAttribute('data-visible', 'false')
  })
})
