import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ShellScrollerProvider,
  useShellScroller,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'

function RegisteredScroller() {
  const registerScroller = useShellScrollerRegistration()
  return <main ref={registerScroller} data-testid="registered-scroller" />
}

function ScrollerConsumer() {
  const scroller = useShellScroller()
  return <output>{scroller?.dataset.testid ?? 'none'}</output>
}

describe('ShellScrollerProvider', () => {
  it('shares the shell-owned scroller with integrations and clears it on unmount', () => {
    const { rerender } = render(
      <ShellScrollerProvider>
        <RegisteredScroller />
        <ScrollerConsumer />
      </ShellScrollerProvider>,
    )

    expect(screen.getByText('registered-scroller')).toBeInTheDocument()

    rerender(
      <ShellScrollerProvider>
        <ScrollerConsumer />
      </ShellScrollerProvider>,
    )
    expect(screen.getByText('none')).toBeInTheDocument()
  })

  it('returns no scroller outside the provider', () => {
    render(<ScrollerConsumer />)
    expect(screen.getByText('none')).toBeInTheDocument()
  })
})
