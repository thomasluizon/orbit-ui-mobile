import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  useShellScroller,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'

const mocks = vi.hoisted(() => ({ wide: false }))

vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({ action, children, nav }: { action?: ReactNode; children: ReactNode; nav: false }) => (
    <div data-testid="wide-flow" data-nav={String(nav)}>{children}{action}</div>
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
