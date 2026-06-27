import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { useTranslations } from 'next-intl'
import { PlanComparisonCards } from '@/components/upgrade/plan-comparison-cards'

const t = ((key: string) => key) as unknown as ReturnType<typeof useTranslations>

describe('PlanComparisonCards', () => {
  it('renders AI Retrospective as a yearly-only row, not a Pro cross', () => {
    render(<PlanComparisonCards t={t} />)

    const row = screen.getByText('upgrade.features.retrospective.label').closest('tr')
    expect(row).not.toBeNull()
    const scoped = within(row as HTMLElement)

    expect(scoped.getByText('upgrade.matrix.yearlyTag')).toBeInTheDocument()
    expect(scoped.getByText('upgrade.matrix.notIncluded')).toBeInTheDocument()
  })

  it('marks free-positive rows as included on both tiers', () => {
    render(<PlanComparisonCards t={t} />)

    const row = screen.getByText('upgrade.features.streaks.label').closest('tr')
    const scoped = within(row as HTMLElement)
    expect(scoped.queryByText('upgrade.matrix.notIncluded')).toBeNull()
    expect(scoped.getAllByText('upgrade.matrix.included')).toHaveLength(2)
  })

  it('renders the four feature categories and hides decorative icons', () => {
    const { container } = render(<PlanComparisonCards t={t} />)
    for (const category of ['habits', 'ai', 'insights', 'personalization']) {
      expect(screen.getByText(`upgrade.categories.${category}`)).toBeInTheDocument()
    }
    const icons = container.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThan(0)
    icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'))
  })
})
