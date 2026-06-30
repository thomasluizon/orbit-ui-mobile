import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { isTrialActive: false, hasProAccess: true } }),
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

import { AiFeatureToggles } from '@/app/(app)/ai-settings/_components/ai-feature-toggles'

function baseProps() {
  return {
    hasProAccess: true,
    aiMemoryEnabled: true,
    aiSummaryEnabled: false,
    proactiveAstraEnabled: true,
    memoryPending: false,
    summaryPending: false,
    proactivePending: false,
    onToggleMemory: vi.fn(),
    onToggleSummary: vi.fn(),
    onToggleProactive: vi.fn(),
  }
}

describe('AiFeatureToggles', () => {
  it('renders memory, summary, and proactive switches reflecting their on/off state', () => {
    render(<AiFeatureToggles {...baseProps()} />)
    expect(
      screen.getByRole('switch', { name: 'profile.aiMemory.title' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByRole('switch', { name: 'profile.aiSummary.title' }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByRole('switch', { name: 'profile.proactiveAstra.title' }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('fires the memory, summary, and proactive toggle callbacks on click', () => {
    const props = baseProps()
    render(<AiFeatureToggles {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'profile.aiMemory.title' }))
    expect(props.onToggleMemory).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('switch', { name: 'profile.aiSummary.title' }))
    expect(props.onToggleSummary).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('switch', { name: 'profile.proactiveAstra.title' }))
    expect(props.onToggleProactive).toHaveBeenCalled()
  })

  it('disables a switch while its mutation is pending', () => {
    const props = { ...baseProps(), memoryPending: true }
    render(<AiFeatureToggles {...props} />)
    expect(
      screen.getByRole('switch', { name: 'profile.aiMemory.title' }),
    ).toBeDisabled()
  })

  it('renders upgrade links instead of switches for non-pro users', () => {
    render(<AiFeatureToggles {...{ ...baseProps(), hasProAccess: false }} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    const upgradeLinks = screen.getAllByRole('link')
    expect(upgradeLinks).toHaveLength(3)
    expect(upgradeLinks[0]).toHaveAttribute('href', '/upgrade')
  })
})
