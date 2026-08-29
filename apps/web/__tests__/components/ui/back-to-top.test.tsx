import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useMemo } from 'react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { BackToTop } from '@/components/ui/back-to-top'
import { useUIStore } from '@/stores/ui-store'
import { Shell412 } from '@/components/shell/shell-412'
import {
  ShellScrollerProvider,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'

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

function ConversationScroller() {
  const owner = useMemo(() => Symbol('conversation'), [])
  const registerScroller = useShellScrollerRegistration(owner)
  return <div ref={registerScroller} role="log" aria-label="Conversation" />
}

function BackToTopConversationHarness({ open }: Readonly<{ open: boolean }>) {
  return (
    <ShellScrollerProvider>
      <Shell412
        tabBar={<div>Tabs</div>}
        conversation={<ConversationScroller />}
        conversationLabel="Conversation"
        conversationOpen={open}
      >
        <div>Today</div>
      </Shell412>
      <BackToTop />
    </ShellScrollerProvider>
  )
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

  it('scrolls the page after a conversation opens and closes', () => {
    const view = render(<BackToTopConversationHarness open={false} />)
    const pageScroller = view.container.querySelector<HTMLElement>('[data-shell-scroller]')
    if (!pageScroller) throw new Error('Expected the page scroller')
    pageScroller.scrollTo = vi.fn()

    view.rerender(<BackToTopConversationHarness open />)
    view.rerender(<BackToTopConversationHarness open={false} />)
    act(() => observerCallback?.([{ isIntersecting: false }]))
    fireEvent.click(screen.getByTestId('back-to-top'))

    expect(pageScroller.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
  })
})
