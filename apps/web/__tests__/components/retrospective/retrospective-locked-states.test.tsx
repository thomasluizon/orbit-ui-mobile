import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { RetrospectiveLockedStates } from '@/app/(app)/retrospective/_components/retrospective-locked-states'

function baseProps() {
  return {
    hasProAccess: true,
    isYearlyPro: true,
    isTrialActive: false,
    portalError: '',
    onOpenPortal: vi.fn(),
  }
}

describe('RetrospectiveLockedStates', () => {
  it('renders the pro-locked block with an upgrade link when not pro', () => {
    render(<RetrospectiveLockedStates {...{ ...baseProps(), hasProAccess: false }} />)
    expect(screen.getByText('retrospective.locked')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'upgrade.subscribe' }),
    ).toHaveAttribute('href', '/upgrade')
  })

  it('renders the yearly-locked block with a change-plan button for paid monthly users', () => {
    const props = { ...baseProps(), isYearlyPro: false }
    render(<RetrospectiveLockedStates {...props} />)
    expect(screen.getByText('retrospective.lockedYearly')).toBeInTheDocument()
    fireEvent.click(screen.getByText('retrospective.changePlan'))
    expect(props.onOpenPortal).toHaveBeenCalled()
  })

  it('renders an upgrade link instead of change-plan when on a trial', () => {
    const props = { ...baseProps(), isYearlyPro: false, isTrialActive: true }
    render(<RetrospectiveLockedStates {...props} />)
    expect(
      screen.getByRole('link', { name: 'upgrade.subscribe' }),
    ).toHaveAttribute('href', '/upgrade')
    expect(screen.queryByText('retrospective.changePlan')).not.toBeInTheDocument()
  })

  it('surfaces a portal error message when present', () => {
    const props = {
      ...baseProps(),
      isYearlyPro: false,
      portalError: 'Could not open portal',
    }
    render(<RetrospectiveLockedStates {...props} />)
    expect(screen.getByText('Could not open portal')).toBeInTheDocument()
  })

  it('renders nothing for a yearly pro user', () => {
    const { container } = render(<RetrospectiveLockedStates {...baseProps()} />)
    expect(container.innerHTML).toBe('')
  })
})
