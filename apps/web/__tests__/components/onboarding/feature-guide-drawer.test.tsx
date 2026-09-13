import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'

describe('FeatureGuideDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <FeatureGuideDrawer open={false} onOpenChange={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the title when open', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('onboarding.featureGuide.title')).toBeInTheDocument()
  })

  it('renders Progresso instead of a standalone goals destination', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('onboarding.featureGuide.astra')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.connect')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.habits')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.progress')).toBeInTheDocument()
    expect(screen.queryByText('onboarding.featureGuide.goals')).not.toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.calendar')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.rewards')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.settings')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.notifications')).toBeInTheDocument()
  })

  it('shows astra section by default', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(document.body.textContent).toContain('onboarding.featureGuide.astraSection.canDoTitle')
  })

  it('omits both retired settings entries', () => {
    render(<FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByText('onboarding.featureGuide.settings'))
    const removedSuffixes = [
      ['ai', 'MemoryTitle'].join(''),
      ['user', 'FactsTitle'].join(''),
    ]
    for (const suffix of removedSuffixes) {
      expect(document.body.textContent).not.toContain(
        `onboarding.featureGuide.settingsSection.${suffix}`,
      )
    }
  })

  it.each([
    { tab: 'connect', title: 'onboarding.featureGuide.connectSection.mcpTitle' },
    { tab: 'habits', title: 'onboarding.featureGuide.habitsSection.creatingTitle' },
    { tab: 'progress', title: 'onboarding.featureGuide.progressSection.goalsTitle' },
    { tab: 'calendar', title: 'onboarding.featureGuide.calendarSection.dayDetailsTitle' },
    { tab: 'rewards', title: 'onboarding.featureGuide.rewardsSection.xpLevelsTitle' },
    { tab: 'notifications', title: 'onboarding.featureGuide.notificationsSection.bellTitle' },
  ])('switches to the $tab section when its tab is clicked', ({ tab, title }) => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText(`onboarding.featureGuide.${tab}`))
    expect(document.body.textContent).toContain(title)
  })

  it('keeps milestone sharing and referrals in the rewards section', () => {
    render(<FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('onboarding.featureGuide.rewards'))

    expect(document.body.textContent).toContain(
      'onboarding.featureGuide.rewardsSection.milestoneShareTitle',
    )
    expect(document.body.textContent).toContain(
      'onboarding.featureGuide.rewardsSection.referralsTitle',
    )
    expect(document.body.textContent).not.toContain(
      'onboarding.featureGuide.rewardsSection.insightsTitle',
    )
    expect(document.body.textContent).not.toContain(
      'onboarding.featureGuide.rewardsSection.retrospectiveTitle',
    )
  })

  it('omits entries for retired surfaces', () => {
    render(<FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('onboarding.featureGuide.calendar'))
    expect(document.body.textContent).not.toContain(
      `onboarding.featureGuide.calendarSection.${['colors', 'Title'].join('')}`,
    )

    fireEvent.click(screen.getByText('onboarding.featureGuide.rewards'))
    for (const prefix of ['insights', 'retrospective']) {
      expect(document.body.textContent).not.toContain(
        `onboarding.featureGuide.rewardsSection.${prefix}Title`,
      )
    }
  })

  it('highlights active tab with aria-selected', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    const astraTab = screen.getByText('onboarding.featureGuide.astra')
    expect(astraTab).toHaveAttribute('aria-selected', 'true')
    const progressTab = screen.getByText('onboarding.featureGuide.progress')
    expect(progressTab).toHaveAttribute('aria-selected', 'false')
  })

  it('uses tablist role for tab container', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
