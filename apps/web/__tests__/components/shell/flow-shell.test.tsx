import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ wide: false }))

vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => mocks.wide }))
vi.mock('@/components/shell/shell-412', () => ({
  Shell412: ({ action, children, nav }: { action?: ReactNode; children: ReactNode; nav: false }) => (
    <div data-testid="compact-flow" data-nav={String(nav)}>{children}{action}</div>
  ),
}))
vi.mock('@/components/shell/shell-wide', () => ({
  ShellWide: ({ action, children, nav }: { action?: ReactNode; children: ReactNode; nav: false }) => (
    <div data-testid="wide-flow" data-nav={String(nav)}>{children}{action}</div>
  ),
}))

import { FlowShell } from '@/components/shell/flow-shell'

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

    expect(screen.getByTestId('compact-flow')).toHaveAttribute('data-nav', 'false')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('uses the wide nav false contract at 1024 and above', () => {
    mocks.wide = true
    render(<FlowShell><h1>Chat</h1></FlowShell>)

    expect(screen.getByTestId('wide-flow')).toHaveAttribute('data-nav', 'false')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })
})
