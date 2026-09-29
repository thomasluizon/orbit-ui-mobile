import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { useAppToastStore } from '@/stores/app-toast-store'
import {
  useShellScroller,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'

const mocks = vi.hoisted(() => ({ wide: false }))

vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({ action, children, nav, notice }: { action?: ReactNode; children: ReactNode; nav: false; notice?: ReactNode }) => (
    <div data-testid="wide-flow" data-nav={String(nav)}>{children}<div data-shell-notice="">{notice}</div>{action}</div>
  ),
}))

import { FlowShell } from '@/components/shell/flow-shell'

function ScrollerConsumer() {
  const scroller = useShellScroller()
  return <output>{scroller?.dataset.testid ?? 'none'}</output>
}

function RegisteredFullFlow() {
  const registerScroller = useShellScrollerRegistration()
  return (
    <>
      <div ref={registerScroller} data-testid="full-flow-scroller" />
      <ScrollerConsumer />
    </>
  )
}

describe('FlowShell', () => {
  beforeEach(() => {
    mocks.wide = false
    useAppToastStore.setState({ currentToast: null, queue: [] })
  })

  it('uses the compact nav false contract and forwards the action slot', () => {
    render(
      <FlowShell action={<button type="button">Continue</button>}>
        <h1>Onboarding</h1>
      </FlowShell>,
    )

    expect(screen.getByTestId('wide-flow')).toHaveAttribute('data-nav', 'false')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('renders queued feedback in the notice slot above the action', () => {
    const { container } = render(<FlowShell action={<button type="button">Continue</button>}>Content</FlowShell>)
    act(() => { useAppToastStore.getState().showError('Try again') })
    const notice = container.querySelector('[data-shell-notice]')
    expect(notice?.querySelector('[data-kind="neutral"]')).toBeInTheDocument()
    expect(notice?.nextElementSibling).toHaveTextContent('Continue')
  })

  it('uses the wide nav false contract at 1024 and above', () => {
    mocks.wide = true
    render(<FlowShell><h1>Chat</h1></FlowShell>)

    expect(screen.getByTestId('wide-flow')).toHaveAttribute('data-nav', 'false')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('uses the uncarded 560px canvas column for onboarding', () => {
    mocks.wide = true
    render(<FlowShell mode="onboarding"><h1>Onboarding</h1></FlowShell>)

    const flow = screen.getByRole('heading', { name: 'Onboarding' }).closest('[data-shell="flow"]')
    expect(flow).toHaveAttribute('data-flow-mode', 'onboarding')
    expect(flow).toHaveClass('max-w-[440px]', 'lg:max-w-[560px]')
    expect(flow?.firstElementChild).not.toHaveClass('md:bg-[var(--bg-card)]')
    expect(flow?.firstElementChild).toHaveClass('my-auto')
  })

  it('fills the wide onboarding action column while card actions keep their own width', () => {
    mocks.wide = true
    const { rerender } = render(<FlowShell mode="onboarding" action={<button type="button">Continue</button>}><h1>Onboarding</h1></FlowShell>)
    const onboardingAction = screen.getByRole('button', { name: 'Continue' }).closest('[data-flow-action]')
    expect(onboardingAction).toHaveClass('lg:max-w-[560px]', '[&>div]:w-full')
    expect(onboardingAction).not.toHaveClass('md:[&_button]:w-auto')

    rerender(<FlowShell mode="card" action={<button type="button">Continue</button>}><h1>Card</h1></FlowShell>)
    expect(screen.getByRole('button', { name: 'Continue' }).closest('[data-flow-action]')).toHaveClass('md:[&_button]:w-auto')
  })

  it('gives chat a full-width definite-height flow instead of the card', () => {
    render(<FlowShell mode="full"><main>Conversation</main></FlowShell>)

    expect(screen.getByText('Conversation').parentElement).toHaveAttribute('data-flow-mode', 'full')
    expect(screen.queryByTestId('wide-flow')).not.toBeInTheDocument()
  })

  it('keeps feedback reachable in the shell-free full flow', () => {
    const view = render(<FlowShell mode="full"><main>Conversation</main></FlowShell>)
    act(() => { useAppToastStore.getState().showError('Connection failed') })

    expect(view.container.querySelector('[data-flow-mode="full"] [data-toast-page-host] [data-kind="neutral"]'))
      .toBeInTheDocument()
  })

  it('provides registration to the full flow without claiming scroll ownership', () => {
    render(
      <FlowShell mode="full">
        <RegisteredFullFlow />
      </FlowShell>,
    )

    expect(screen.getByText('full-flow-scroller')).toBeInTheDocument()
    expect(screen.getByText('full-flow-scroller').closest('[data-flow-mode="full"]'))
      .not.toHaveAttribute('data-shell-scroller')
  })
})
