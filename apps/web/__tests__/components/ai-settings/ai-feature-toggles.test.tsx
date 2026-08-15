import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/pro-badge', () => ({
  ProBadge: () => null,
}))

import { AiFeatureToggles } from '@/app/(app)/ai-settings/_components/ai-feature-toggles'

function baseProps() {
  return {
    hasProAccess: true,
    aiSummaryEnabled: false,
    proactiveAstraEnabled: true,
    summaryPending: false,
    proactivePending: false,
    onToggleSummary: vi.fn(),
    onToggleProactive: vi.fn(),
    onUpgrade: vi.fn(),
  }
}

describe('AiFeatureToggles', () => {
  it('renders exactly the daily summary and proactive switches for Pro users', () => {
    render(<AiFeatureToggles {...baseProps()} />)
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(2)
    expect(screen.getByRole('switch', { name: 'profile.aiSummary.title' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(
      screen.getByRole('switch', { name: 'profile.proactiveAstra.title' }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('fires both surviving toggle callbacks on click', () => {
    const props = baseProps()
    render(<AiFeatureToggles {...props} />)
    fireEvent.click(screen.getByRole('switch', { name: 'profile.aiSummary.title' }))
    expect(props.onToggleSummary).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('switch', { name: 'profile.proactiveAstra.title' }))
    expect(props.onToggleProactive).toHaveBeenCalled()
  })

  it('disables the summary switch while its mutation is pending', () => {
    render(<AiFeatureToggles {...baseProps()} summaryPending />)
    expect(screen.getByRole('switch', { name: 'profile.aiSummary.title' })).toBeDisabled()
  })

  it('renders two upgrade rows and no switches for free users', () => {
    const props = { ...baseProps(), hasProAccess: false }
    render(<AiFeatureToggles {...props} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(2)
    fireEvent.click(rows[0]!)
    expect(props.onUpgrade).toHaveBeenCalled()
  })
})
