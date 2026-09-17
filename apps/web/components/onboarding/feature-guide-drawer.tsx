'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sheet } from '@/components/ui/sheet'

type SectionKey =
  | 'habits'
  | 'astra'
  | 'connect'
  | 'progress'
  | 'calendar'
  | 'rewards'
  | 'reminders'
  | 'widget'

const tabs: { key: SectionKey; labelKey: string }[] = [
  { key: 'habits', labelKey: 'onboarding.featureGuide.habits' },
  { key: 'astra', labelKey: 'onboarding.featureGuide.astra' },
  { key: 'connect', labelKey: 'onboarding.featureGuide.connect' },
  { key: 'progress', labelKey: 'onboarding.featureGuide.progress' },
  { key: 'calendar', labelKey: 'onboarding.featureGuide.calendar' },
  { key: 'rewards', labelKey: 'onboarding.featureGuide.rewards' },
  { key: 'reminders', labelKey: 'onboarding.featureGuide.reminders' },
  { key: 'widget', labelKey: 'onboarding.featureGuide.widget' },
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
  progress: [
    { titleKey: 'onboarding.featureGuide.progressSection.goalsTitle', descKey: 'onboarding.featureGuide.progressSection.goalsDesc' },
    { titleKey: 'onboarding.featureGuide.progressSection.trackingTitle', descKey: 'onboarding.featureGuide.progressSection.trackingDesc' },
    { titleKey: 'onboarding.featureGuide.progressSection.linkingTitle', descKey: 'onboarding.featureGuide.progressSection.linkingDesc' },
    { titleKey: 'onboarding.featureGuide.progressSection.aiReviewTitle', descKey: 'onboarding.featureGuide.progressSection.aiReviewDesc' },
    { titleKey: 'onboarding.featureGuide.progressSection.statusTitle', descKey: 'onboarding.featureGuide.progressSection.statusDesc' },
  ],
  calendar: [
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
    { titleKey: 'onboarding.featureGuide.rewardsSection.milestoneShareTitle', descKey: 'onboarding.featureGuide.rewardsSection.milestoneShareDesc' },
    { titleKey: 'onboarding.featureGuide.rewardsSection.referralsTitle', descKey: 'onboarding.featureGuide.rewardsSection.referralsDesc' },
  ],
  reminders: [
    { titleKey: 'onboarding.featureGuide.remindersSection.bellTitle', descKey: 'onboarding.featureGuide.remindersSection.bellDesc' },
    { titleKey: 'onboarding.featureGuide.remindersSection.managingTitle', descKey: 'onboarding.featureGuide.remindersSection.managingDesc' },
    { titleKey: 'onboarding.featureGuide.remindersSection.configuringRemindersTitle', descKey: 'onboarding.featureGuide.remindersSection.configuringRemindersDesc' },
  ],
  widget: [
    { titleKey: 'onboarding.featureGuide.widgetSection.todayTitle', descKey: 'onboarding.featureGuide.widgetSection.todayDesc' },
    { titleKey: 'onboarding.featureGuide.widgetSection.opensTitle', descKey: 'onboarding.featureGuide.widgetSection.opensDesc' },
  ],
}

interface FeatureGuideDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeatureGuideDrawer({ open, onOpenChange }: Readonly<FeatureGuideDrawerProps>) {
  const t = useTranslations()
  const [activeSection, setActiveSection] = useState<SectionKey>('habits')

  const items = sectionItems[activeSection]

  return (
    open ? (<Sheet open onClose={() => (onOpenChange)(false)} title={t('onboarding.featureGuide.title')}>
      <div className="overlay-bleed">
        <div
          role="tablist"
          className="flex"
          style={{
            gap: 8,
            padding: '4px 24px 12px',
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
              padding: '12px 24px',
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
                fontSize: 13.5,
                color: 'var(--fg-3)',
                lineHeight: 1.55,
              }}
            >
              {t(item.descKey)}
            </p>
          </div>
        ))}
      </div>
    </Sheet>) : null
  )
}
