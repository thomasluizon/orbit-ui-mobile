import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMemo } from 'react'
import {
  ShellScrollerProvider,
  useShellScroller,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'

function RegisteredScroller({ name }: Readonly<{ name: string }>) {
  const owner = useMemo(() => Symbol(name), [name])
  const registerScroller = useShellScrollerRegistration(owner)
  return <main ref={registerScroller} data-testid={name} />
}

function ScrollerConsumer() {
  const scroller = useShellScroller()
  return <output>{scroller?.dataset.testid ?? 'none'}</output>
}

describe('ShellScrollerProvider', () => {
  it('shares the shell-owned scroller with integrations and clears it on unmount', () => {
    const { rerender } = render(
      <ShellScrollerProvider>
        <RegisteredScroller name="registered-scroller" />
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

  it('restores the previous live scroller when the latest owner unmounts', () => {
    const { rerender } = render(
      <ShellScrollerProvider>
        <RegisteredScroller name="page-scroller" />
        <RegisteredScroller name="conversation-scroller" />
        <ScrollerConsumer />
      </ShellScrollerProvider>,
    )

    expect(screen.getByText('conversation-scroller')).toBeInTheDocument()

    rerender(
      <ShellScrollerProvider>
        <RegisteredScroller name="page-scroller" />
        <ScrollerConsumer />
      </ShellScrollerProvider>,
    )

    expect(screen.getByText('page-scroller')).toBeInTheDocument()
  })

  it('returns no scroller outside the provider', () => {
    render(<ScrollerConsumer />)
    expect(screen.getByText('none')).toBeInTheDocument()
  })
})
