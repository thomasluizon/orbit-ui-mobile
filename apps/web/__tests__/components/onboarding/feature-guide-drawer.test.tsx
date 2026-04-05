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

  it('renders all six tabs', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getByText('onboarding.featureGuide.habits')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.goals')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.chat')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.calendar')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.settings')).toBeInTheDocument()
    expect(screen.getByText('onboarding.featureGuide.notifications')).toBeInTheDocument()
  })

  it('shows habits section by default', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(document.body.textContent).toContain('onboarding.featureGuide.habitsSection.creatingTitle')
  })

  it('switches to goals section when goals tab clicked', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('onboarding.featureGuide.goals'))
    expect(document.body.textContent).toContain('onboarding.featureGuide.goalsSection.creatingTitle')
  })

  it('switches to chat section when chat tab clicked', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('onboarding.featureGuide.chat'))
    expect(document.body.textContent).toContain('onboarding.featureGuide.chatSection.canDoTitle')
  })

  it('switches to calendar section', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('onboarding.featureGuide.calendar'))
    expect(document.body.textContent).toContain('onboarding.featureGuide.calendarSection.colorsTitle')
  })

  it('switches to settings section', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('onboarding.featureGuide.settings'))
    expect(document.body.textContent).toContain('onboarding.featureGuide.settingsSection.colorSchemeTitle')
  })

  it('switches to notifications section', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('onboarding.featureGuide.notifications'))
    expect(document.body.textContent).toContain('onboarding.featureGuide.notificationsSection.bellTitle')
  })

  it('highlights active tab with aria-selected', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    const habitsTab = screen.getByText('onboarding.featureGuide.habits')
    expect(habitsTab).toHaveAttribute('aria-selected', 'true')
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
