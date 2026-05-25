'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'

type SectionKey = 'habits' | 'goals' | 'chat' | 'calendar' | 'settings' | 'notifications'

const tabs: { key: SectionKey; labelKey: string }[] = [
  { key: 'habits', labelKey: 'onboarding.featureGuide.habits' },
  { key: 'goals', labelKey: 'onboarding.featureGuide.goals' },
  { key: 'chat', labelKey: 'onboarding.featureGuide.chat' },
  { key: 'calendar', labelKey: 'onboarding.featureGuide.calendar' },
  { key: 'settings', labelKey: 'onboarding.featureGuide.settings' },
  { key: 'notifications', labelKey: 'onboarding.featureGuide.notifications' },
]

interface SectionItem {
  titleKey: string
  descKey: string
}

const sectionItems: Record<SectionKey, SectionItem[]> = {
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
    { titleKey: 'onboarding.featureGuide.habitsSection.retrospectiveTitle', descKey: 'onboarding.featureGuide.habitsSection.retrospectiveDesc' },
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
  chat: [
    { titleKey: 'onboarding.featureGuide.chatSection.canDoTitle', descKey: 'onboarding.featureGuide.chatSection.canDoDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.manageTitle', descKey: 'onboarding.featureGuide.chatSection.manageDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.insightsTitle', descKey: 'onboarding.featureGuide.chatSection.insightsDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.imageTitle', descKey: 'onboarding.featureGuide.chatSection.imageDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.voiceTitle', descKey: 'onboarding.featureGuide.chatSection.voiceDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.cannotDoTitle', descKey: 'onboarding.featureGuide.chatSection.cannotDoDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.tipsTitle', descKey: 'onboarding.featureGuide.chatSection.tipsDesc' },
    { titleKey: 'onboarding.featureGuide.chatSection.reschedulingTitle', descKey: 'onboarding.featureGuide.chatSection.reschedulingDesc' },
  ],
  calendar: [
    { titleKey: 'onboarding.featureGuide.calendarSection.colorsTitle', descKey: 'onboarding.featureGuide.calendarSection.colorsDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.dayDetailsTitle', descKey: 'onboarding.featureGuide.calendarSection.dayDetailsDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.navigationTitle', descKey: 'onboarding.featureGuide.calendarSection.navigationDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.streaksTitle', descKey: 'onboarding.featureGuide.calendarSection.streaksDesc' },
    { titleKey: 'onboarding.featureGuide.calendarSection.googleCalendarTitle', descKey: 'onboarding.featureGuide.calendarSection.googleCalendarDesc' },
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
    { titleKey: 'onboarding.featureGuide.settingsSection.retrospectiveTitle', descKey: 'onboarding.featureGuide.settingsSection.retrospectiveDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.weekStartDayTitle', descKey: 'onboarding.featureGuide.settingsSection.weekStartDayDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.referralTitle', descKey: 'onboarding.featureGuide.settingsSection.referralDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.gamificationTitle', descKey: 'onboarding.featureGuide.settingsSection.gamificationDesc' },
    { titleKey: 'onboarding.featureGuide.settingsSection.widgetTitle', descKey: 'onboarding.featureGuide.settingsSection.widgetDesc' },
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
  const [activeSection, setActiveSection] = useState<SectionKey>('habits')

  const items = sectionItems[activeSection]

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('onboarding.featureGuide.title')}>
      <div className="-mx-6">
        {/* Tab strip — overflow-x scroll, v8 hairline chips */}
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
                tabIndex={isActive ? 0 : -1}
                className={
                  'appearance-none cursor-pointer inline-flex items-center whitespace-nowrap shrink-0 transition-[background-color,color,box-shadow] duration-150 ease-out ' +
                  (isActive
                    ? ''
                    : 'hover:bg-[var(--bg-elev)] hover:text-[var(--fg-1)]')
                }
                style={{
                  height: 26,
                  padding: '0 9px',
                  borderRadius: 6,
                  background: isActive ? 'var(--bg-elev)' : 'transparent',
                  boxShadow: isActive
                    ? 'inset 0 0 0 1px var(--fg-3)'
                    : 'inset 0 0 0 1px var(--hairline-strong)',
                  border: 0,
                  color: isActive ? 'var(--fg-1)' : 'var(--fg-2)',
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                }}
                onClick={() => setActiveSection(tab.key)}
              >
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>

        {/* Section content — flush hairline rows */}
        {items.map((item) => (
          <div
            key={item.titleKey}
            className="flex flex-col"
            style={{
              padding: '12px 20px',
              gap: 4,
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            <h3
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--fg-1)',
              }}
            >
              {t(item.titleKey)}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
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
