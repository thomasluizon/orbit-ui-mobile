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

  it('renders all nine tabs', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('onboarding.featureGuide.astra')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.connect')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.social')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.habits')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.goals')).toBeInTheDocument()
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

  it.each([
    { tab: 'connect', title: 'onboarding.featureGuide.connectSection.mcpTitle' },
    { tab: 'social', title: 'onboarding.featureGuide.socialSection.optInTitle' },
    { tab: 'habits', title: 'onboarding.featureGuide.habitsSection.creatingTitle' },
    { tab: 'goals', title: 'onboarding.featureGuide.goalsSection.creatingTitle' },
    { tab: 'calendar', title: 'onboarding.featureGuide.calendarSection.colorsTitle' },
    { tab: 'rewards', title: 'onboarding.featureGuide.rewardsSection.xpLevelsTitle' },
    { tab: 'settings', title: 'onboarding.featureGuide.settingsSection.colorSchemeTitle' },
    { tab: 'notifications', title: 'onboarding.featureGuide.notificationsSection.bellTitle' },
  ])('switches to the $tab section when its tab is clicked', ({ tab, title }) => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText(`onboarding.featureGuide.${tab}`))
    expect(document.body.textContent).toContain(title)
  })

  it('highlights active tab with aria-selected', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    const astraTab = screen.getByText('onboarding.featureGuide.astra')
    expect(astraTab).toHaveAttribute('aria-selected', 'true')
    const goalsTab = screen.getByText('onboarding.featureGuide.goals')
    expect(goalsTab).toHaveAttribute('aria-selected', 'false')
  })

  it('uses tablist role for tab container', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
