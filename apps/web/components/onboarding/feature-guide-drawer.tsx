'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'

type SectionKey =
  | 'astra'
  | 'connect'
  | 'social'
  | 'habits'
  | 'goals'
  | 'calendar'
  | 'rewards'
  | 'settings'
  | 'notifications'

const tabs: { key: SectionKey; labelKey: string }[] = [
  { key: 'astra', labelKey: 'onboarding.featureGuide.astra' },
  { key: 'connect', labelKey: 'onboarding.featureGuide.connect' },
  { key: 'social', labelKey: 'onboarding.featureGuide.social' },
  { key: 'habits', labelKey: 'onboarding.featureGuide.habits' },
  { key: 'goals', labelKey: 'onboarding.featureGuide.goals' },
  { key: 'calendar', labelKey: 'onboarding.featureGuide.calendar' },
  { key: 'rewards', labelKey: 'onboarding.featureGuide.rewards' },
  { key: 'settings', labelKey: 'onboarding.featureGuide.settings' },
  { key: 'notifications', labelKey: 'onboarding.featureGuide.notifications' },
]

interface SectionItem {
  titleKey: string
  descKey: string
}

const sectionItems: Record<SectionKey, SectionItem[]> = {
  astra: [
    { titleKey: 'onboarding.featureGuide.astraSection.canDoTitle', descKey: 'onboarding.featureGuide.astraSection.canDoDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.toolsBreadthTitle', descKey: 'onboarding.featureGuide.astraSection.toolsBreadthDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.manageTitle', descKey: 'onboarding.featureGuide.astraSection.manageDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.insightsTitle', descKey: 'onboarding.featureGuide.astraSection.insightsDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.reschedulingTitle', descKey: 'onboarding.featureGuide.astraSection.reschedulingDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.imageTitle', descKey: 'onboarding.featureGuide.astraSection.imageDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.voiceTitle', descKey: 'onboarding.featureGuide.astraSection.voiceDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.cannotDoTitle', descKey: 'onboarding.featureGuide.astraSection.cannotDoDesc' },
    { titleKey: 'onboarding.featureGuide.astraSection.tipsTitle', descKey: 'onboarding.featureGuide.astraSection.tipsDesc' },
  ],
  connect: [
    { titleKey: 'onboarding.featureGuide.connectSection.mcpTitle', descKey: 'onboarding.featureGuide.connectSection.mcpDesc' },
    { titleKey: 'onboarding.featureGuide.connectSection.assistantCanDoTitle', descKey: 'onboarding.featureGuide.connectSection.assistantCanDoDesc' },
    { titleKey: 'onboarding.featureGuide.connectSection.apiKeysTitle', descKey: 'onboarding.featureGuide.connectSection.apiKeysDesc' },
    { titleKey: 'onboarding.featureGuide.connectSection.setupTitle', descKey: 'onboarding.featureGuide.connectSection.setupDesc' },
  ],
  social: [
    { titleKey: 'onboarding.featureGuide.socialSection.optInTitle', descKey: 'onboarding.featureGuide.socialSection.optInDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.buddiesTitle', descKey: 'onboarding.featureGuide.socialSection.buddiesDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.challengesTitle', descKey: 'onboarding.featureGuide.socialSection.challengesDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.cheersTitle', descKey: 'onboarding.featureGuide.socialSection.cheersDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.friendsTitle', descKey: 'onboarding.featureGuide.socialSection.friendsDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.publicProfileTitle', descKey: 'onboarding.featureGuide.socialSection.publicProfileDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.milestoneShareTitle', descKey: 'onboarding.featureGuide.socialSection.milestoneShareDesc' },
    { titleKey: 'onboarding.featureGuide.socialSection.referralsTitle', descKey: 'onboarding.featureGuide.socialSection.referralsDesc' },
  ],
  habits: [
    { titleKey: 'onboarding.featureGuide.habitsSection.creatingTitle', descKey: 'onboarding.featureGuide.habitsSection.creatingDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.frequenciesTitle', descKey: 'onboarding.featureGuide.habitsSection.frequenciesDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.subHabitsTitle', descKey: 'onboarding.featureGuide.habitsSection.subHabitsDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.checklistsTitle', descKey: 'onboarding.featureGuide.habitsSection.checklistsDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.loggingTitle', descKey: 'onboarding.featureGuide.habitsSection.loggingDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.badHabitsTitle', descKey: 'onboarding.featureGuide.habitsSection.badHabitsDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.slipAlertsTitle', descKey: 'onboarding.featureGuide.habitsSection.slipAlertsDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.metricsTitle', descKey: 'onboarding.featureGuide.habitsSection.metricsDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.dragDropTitle', descKey: 'onboarding.featureGuide.habitsSection.dragDropDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.endDatesTitle', descKey: 'onboarding.featureGuide.habitsSection.endDatesDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.goalLinkingTitle', descKey: 'onboarding.featureGuide.habitsSection.goalLinkingDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.tagDisplayTitle', descKey: 'onboarding.featureGuide.habitsSection.tagDisplayDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.bulkSelectTitle', descKey: 'onboarding.featureGuide.habitsSection.bulkSelectDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.filteringTitle', descKey: 'onboarding.featureGuide.habitsSection.filteringDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.summaryTitle', descKey: 'onboarding.featureGuide.habitsSection.summaryDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.remindersTitle', descKey: 'onboarding.featureGuide.habitsSection.remindersDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.oneTimeTasksTitle', descKey: 'onboarding.featureGuide.habitsSection.oneTimeTasksDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.duplicateTitle', descKey: 'onboarding.featureGuide.habitsSection.duplicateDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.dateNavTitle', descKey: 'onboarding.featureGuide.habitsSection.dateNavDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.flexibleTitle', descKey: 'onboarding.featureGuide.habitsSection.flexibleDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.generalTitle', descKey: 'onboarding.featureGuide.habitsSection.generalDesc' },
    { titleKey: 'onboarding.featureGuide.habitsSection.skipTitle', descKey: 'onboarding.featureGuide.habitsSection.skipDesc' },
  ],
  goals: [
    { titleKey: 'onboarding.featureGuide.goalsSection.creatingTitle', descKey: 'onboarding.featureGuide.goalsSection.creatingDesc' },
    { titleKey: 'onboarding.featureGuide.goalsSection.trackingTitle', descKey: 'onboarding.featureGuide.goalsSection.trackingDesc' },
    { titleKey: 'onboarding.featureGuide.goalsSection.linkingTitle', descKey: 'onboarding.featureGuide.goalsSection.linkingDesc' },
    { titleKey: 'onboarding.featureGuide.goalsSection.dashboardTitle', descKey: 'onboarding.featureGuide.goalsSection.dashboardDesc' },
    { titleKey: 'onboarding.featureGuide.goalsSection.aiReviewTitle', descKey: 'onboarding.featureGuide.goalsSection.aiReviewDesc' },
    { titleKey: 'onboarding.featureGuide.goalsSection.statusTitle', descKey: 'onboarding.featureGuide.goalsSection.statusDesc' },
  ],
  calendar: [
    { titleKey: 'onboarding.featureGuide.calendarSection.colorsTitle', descKey: 'onboarding.featureGuide.calendarSection.colorsDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.dayDetailsTitle', descKey: 'onboarding.featureGuide.calendarSection.dayDetailsDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.navigationTitle', descKey: 'onboarding.featureGuide.calendarSection.navigationDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.streaksTitle', descKey: 'onboarding.featureGuide.calendarSection.streaksDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.googleCalendarTitle', descKey: 'onboarding.featureGuide.calendarSection.googleCalendarDesc' },
  ],
  rewards: [
    { titleKey: 'onboarding.featureGuide.rewardsSection.xpLevelsTitle', descKey: 'onboarding.featureGuide.rewardsSection.xpLevelsDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.achievementsTitle', descKey: 'onboarding.featureGuide.rewardsSection.achievementsDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.streaksTitle', descKey: 'onboarding.featureGuide.rewardsSection.streaksDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.streakFreezeTitle', descKey: 'onboarding.featureGuide.rewardsSection.streakFreezeDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.wrappedTitle', descKey: 'onboarding.featureGuide.rewardsSection.wrappedDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.widgetTitle', descKey: 'onboarding.featureGuide.rewardsSection.widgetDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.insightsTitle', descKey: 'onboarding.featureGuide.rewardsSection.insightsDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.retrospectiveTitle', descKey: 'onboarding.featureGuide.rewardsSection.retrospectiveDesc' },
  ],
  settings: [
    { titleKey: 'onboarding.featureGuide.settingsSection.colorSchemeTitle', descKey: 'onboarding.featureGuide.settingsSection.colorSchemeDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.languageTitle', descKey: 'onboarding.featureGuide.settingsSection.languageDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.aiMemoryTitle', descKey: 'onboarding.featureGuide.settingsSection.aiMemoryDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.aiSummaryTitle', descKey: 'onboarding.featureGuide.settingsSection.aiSummaryDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.userFactsTitle', descKey: 'onboarding.featureGuide.settingsSection.userFactsDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.timezoneTitle', descKey: 'onboarding.featureGuide.settingsSection.timezoneDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.supportTitle', descKey: 'onboarding.featureGuide.settingsSection.supportDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.pushNotificationsTitle', descKey: 'onboarding.featureGuide.settingsSection.pushNotificationsDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.subscriptionTitle', descKey: 'onboarding.featureGuide.settingsSection.subscriptionDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.weekStartDayTitle', descKey: 'onboarding.featureGuide.settingsSection.weekStartDayDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.showGeneralTodayTitle', descKey: 'onboarding.featureGuide.settingsSection.showGeneralTodayDesc' },
  ],
  notifications: [
    { titleKey: 'onboarding.featureGuide.notificationsSection.bellTitle', descKey: 'onboarding.featureGuide.notificationsSection.bellDesc' },
    { titleKey: 'onboarding.featureGuide.notificationsSection.managingTitle', descKey: 'onboarding.featureGuide.notificationsSection.managingDesc' },
    { titleKey: 'onboarding.featureGuide.notificationsSection.configuringRemindersTitle', descKey: 'onboarding.featureGuide.notificationsSection.configuringRemindersDesc' },
  ],
}

interface FeatureGuideDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeatureGuideDrawer({ open, onOpenChange }: Readonly<FeatureGuideDrawerProps>) {
  const t = useTranslations()
  const [activeSection, setActiveSection] = useState<SectionKey>('astra')

  const items = sectionItems[activeSection]

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('onboarding.featureGuide.title')}>
      <div className="overlay-bleed">
        <div
          role="tablist"
          className="flex"
          style={{
            gap: 6,
            padding: '4px 20px 12px',
            overflowX: 'auto',
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeSection === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? 'chip chip-active' : 'chip'}
                onClick={() => setActiveSection(tab.key)}
              >
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>

        {items.map((item) => (
          <div
            key={item.titleKey}
            className="flex flex-col"
            style={{
              padding: '12px 20px',
              gap: 4,
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {t(item.titleKey)}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--fg-2)',
                lineHeight: 1.55,
              }}
            >
              {t(item.descKey)}
            </p>
          </div>
        ))}
      </div>
    </AppOverlay>
  )
}
