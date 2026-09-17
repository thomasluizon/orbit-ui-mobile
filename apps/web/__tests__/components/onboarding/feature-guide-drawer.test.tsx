import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

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

  it('renders the eight guide subjects in their product order', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'onboarding.featureGuide.habits',
      'onboarding.featureGuide.astra',
      'onboarding.featureGuide.connect',
      'onboarding.featureGuide.progress',
      'onboarding.featureGuide.calendar',
      'onboarding.featureGuide.rewards',
      'onboarding.featureGuide.reminders',
      'onboarding.featureGuide.widget',
    ])
  })

  it('shows habits by default', () => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    expect(document.body.textContent).toContain('onboarding.featureGuide.habitsSection.creatingTitle')
  })

  it.each([
    { tab: 'connect', title: 'onboarding.featureGuide.connectSection.mcpTitle' },
    { tab: 'habits', title: 'onboarding.featureGuide.habitsSection.creatingTitle' },
    { tab: 'progress', title: 'onboarding.featureGuide.progressSection.goalsTitle' },
    { tab: 'calendar', title: 'onboarding.featureGuide.calendarSection.dayDetailsTitle' },
    { tab: 'rewards', title: 'onboarding.featureGuide.rewardsSection.xpLevelsTitle' },
    { tab: 'reminders', title: 'onboarding.featureGuide.remindersSection.bellTitle' },
    { tab: 'widget', title: 'onboarding.featureGuide.widgetSection.todayTitle' },
  ])('switches to the $tab section when its tab is clicked', ({ tab, title }) => {
    render(
      <FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByText(`onboarding.featureGuide.${tab}`))
    expect(document.body.textContent).toContain(title)
  })

  it('moves the widget guidance out of rewards', () => {
    render(<FeatureGuideDrawer open={true} onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByText('onboarding.featureGuide.rewards'))

    expect(document.body.textContent).not.toContain(
      `onboarding.featureGuide.rewardsSection.${['widget', 'Title'].join('')}`,
    )

    fireEvent.click(screen.getByText('onboarding.featureGuide.widget'))
    expect(document.body.textContent).toContain(
      'onboarding.featureGuide.widgetSection.opensTitle',
    )
  })

  it('describes a streak freeze as a repair the person performs', () => {
    expect(en.onboarding.featureGuide.rewardsSection.streakFreezeDesc).toBe(
      'Orbit banks a freeze as your streak grows. You choose to spend one to repair yesterday.',
    )
    expect(ptBR.onboarding.featureGuide.rewardsSection.streakFreezeDesc).toBe(
      'O Orbit guarda uma proteção conforme a sua sequência cresce. Você escolhe usar uma para reparar o dia de ontem.',
    )
  })

  it('states that the Android widget opens Orbit and never logs', () => {
    expect(en.onboarding.featureGuide.widgetSection.opensDesc).toContain('never logs')
    expect(ptBR.onboarding.featureGuide.widgetSection.opensDesc).toContain('nunca registra')
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
    expect(astraTab).toHaveAttribute('aria-selected', 'false')
    const habitsTab = screen.getByText('onboarding.featureGuide.habits')
    expect(habitsTab).toHaveAttribute('aria-selected', 'true')
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
