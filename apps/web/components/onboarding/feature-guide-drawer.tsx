'use client'

import { useState } from 'react'
import { AppOverlay } from '@/components/ui/app-overlay'

// TODO: Replace with next-intl when i18n is wired up
const t = (key: string) => {
  const strings: Record<string, string> = {
    'onboarding.featureGuide.title': 'Feature Guide',
    'onboarding.featureGuide.habits': 'Habits',
    'onboarding.featureGuide.goals': 'Goals',
    'onboarding.featureGuide.chat': 'Chat',
    'onboarding.featureGuide.calendar': 'Calendar',
    'onboarding.featureGuide.settings': 'Settings',
    'onboarding.featureGuide.notifications': 'Notifications',
    // Habits section
    'onboarding.featureGuide.habitsSection.creatingTitle': 'Creating Habits',
    'onboarding.featureGuide.habitsSection.creatingDesc': 'Tap the + button to create a new habit. Give it a name and set a frequency.',
    'onboarding.featureGuide.habitsSection.frequenciesTitle': 'Frequencies',
    'onboarding.featureGuide.habitsSection.frequenciesDesc': 'Daily, weekly, monthly, or custom intervals. Set specific days of the week.',
    'onboarding.featureGuide.habitsSection.subHabitsTitle': 'Sub-habits',
    'onboarding.featureGuide.habitsSection.subHabitsDesc': 'Break habits into smaller steps. Complete all sub-habits to mark the parent done.',
    'onboarding.featureGuide.habitsSection.checklistsTitle': 'Checklists',
    'onboarding.featureGuide.habitsSection.checklistsDesc': 'Add checklist items to a habit for multi-step routines.',
    'onboarding.featureGuide.habitsSection.loggingTitle': 'Logging',
    'onboarding.featureGuide.habitsSection.loggingDesc': 'Tap the circle to complete a habit for today. Long-press for past dates.',
    'onboarding.featureGuide.habitsSection.badHabitsTitle': 'Bad Habits',
    'onboarding.featureGuide.habitsSection.badHabitsDesc': 'Track habits you want to break. The goal is to NOT complete them.',
    'onboarding.featureGuide.habitsSection.slipAlertsTitle': 'Slip Alerts',
    'onboarding.featureGuide.habitsSection.slipAlertsDesc': 'Get notified when you\'re about to break a streak.',
    'onboarding.featureGuide.habitsSection.metricsTitle': 'Metrics',
    'onboarding.featureGuide.habitsSection.metricsDesc': 'View completion rates, streaks, and trends for each habit.',
    'onboarding.featureGuide.habitsSection.dragDropTitle': 'Reordering',
    'onboarding.featureGuide.habitsSection.dragDropDesc': 'Drag and drop to reorder habits. Your order is saved automatically.',
    'onboarding.featureGuide.habitsSection.endDatesTitle': 'Due Dates',
    'onboarding.featureGuide.habitsSection.endDatesDesc': 'Set due dates for one-time tasks and deadlines.',
    'onboarding.featureGuide.habitsSection.goalLinkingTitle': 'Goal Linking',
    'onboarding.featureGuide.habitsSection.goalLinkingDesc': 'Link habits to goals to track progress automatically.',
    'onboarding.featureGuide.habitsSection.tagDisplayTitle': 'Tags',
    'onboarding.featureGuide.habitsSection.tagDisplayDesc': 'Organize habits with colored tags for easy filtering.',
    'onboarding.featureGuide.habitsSection.bulkSelectTitle': 'Bulk Actions',
    'onboarding.featureGuide.habitsSection.bulkSelectDesc': 'Select multiple habits to complete, skip, or delete in bulk.',
    'onboarding.featureGuide.habitsSection.filteringTitle': 'Filtering',
    'onboarding.featureGuide.habitsSection.filteringDesc': 'Filter by frequency, tags, or completion status.',
    'onboarding.featureGuide.habitsSection.summaryTitle': 'Daily Summary',
    'onboarding.featureGuide.habitsSection.summaryDesc': 'AI-generated summary of your day\'s progress.',
    'onboarding.featureGuide.habitsSection.remindersTitle': 'Reminders',
    'onboarding.featureGuide.habitsSection.remindersDesc': 'Set custom reminder times for each habit.',
    'onboarding.featureGuide.habitsSection.oneTimeTasksTitle': 'One-time Tasks',
    'onboarding.featureGuide.habitsSection.oneTimeTasksDesc': 'Create tasks without a frequency for things you need to do once.',
    'onboarding.featureGuide.habitsSection.duplicateTitle': 'Duplicate',
    'onboarding.featureGuide.habitsSection.duplicateDesc': 'Quickly duplicate a habit with all its settings.',
    'onboarding.featureGuide.habitsSection.dateNavTitle': 'Date Navigation',
    'onboarding.featureGuide.habitsSection.dateNavDesc': 'Swipe or tap to view habits for any date.',
    'onboarding.featureGuide.habitsSection.retrospectiveTitle': 'Retrospective',
    'onboarding.featureGuide.habitsSection.retrospectiveDesc': 'AI-generated review of your habits over time.',
    'onboarding.featureGuide.habitsSection.flexibleTitle': 'Flexible Habits',
    'onboarding.featureGuide.habitsSection.flexibleDesc': 'Set a target like "3 times this week" instead of specific days.',
    'onboarding.featureGuide.habitsSection.generalTitle': 'General Habits',
    'onboarding.featureGuide.habitsSection.generalDesc': 'Habits without a schedule that appear every day.',
    'onboarding.featureGuide.habitsSection.logNotesTitle': 'Log Notes',
    'onboarding.featureGuide.habitsSection.logNotesDesc': 'Add notes when completing a habit to track details.',
    'onboarding.featureGuide.habitsSection.skipTitle': 'Skipping',
    'onboarding.featureGuide.habitsSection.skipDesc': 'Skip a habit for today without breaking your streak.',
    // Goals section
    'onboarding.featureGuide.goalsSection.creatingTitle': 'Creating Goals',
    'onboarding.featureGuide.goalsSection.creatingDesc': 'Set measurable goals with a target value and unit.',
    'onboarding.featureGuide.goalsSection.trackingTitle': 'Progress Tracking',
    'onboarding.featureGuide.goalsSection.trackingDesc': 'Update progress manually or automatically via linked habits.',
    'onboarding.featureGuide.goalsSection.linkingTitle': 'Habit Linking',
    'onboarding.featureGuide.goalsSection.linkingDesc': 'Link habits to goals. Each habit completion counts toward progress.',
    'onboarding.featureGuide.goalsSection.dashboardTitle': 'Dashboard',
    'onboarding.featureGuide.goalsSection.dashboardDesc': 'View all goals with progress bars and status at a glance.',
    'onboarding.featureGuide.goalsSection.aiReviewTitle': 'AI Review',
    'onboarding.featureGuide.goalsSection.aiReviewDesc': 'Get AI-powered insights on your goal progress.',
    'onboarding.featureGuide.goalsSection.statusTitle': 'Status Management',
    'onboarding.featureGuide.goalsSection.statusDesc': 'Mark goals as in progress, completed, or abandoned.',
    // Chat section
    'onboarding.featureGuide.chatSection.canDoTitle': 'What AI Can Do',
    'onboarding.featureGuide.chatSection.canDoDesc': 'Create, update, and manage habits and goals through natural conversation.',
    'onboarding.featureGuide.chatSection.manageTitle': 'Habit Management',
    'onboarding.featureGuide.chatSection.manageDesc': 'Ask AI to create habits, change schedules, or log completions.',
    'onboarding.featureGuide.chatSection.insightsTitle': 'Insights',
    'onboarding.featureGuide.chatSection.insightsDesc': 'Ask about your streaks, completion rates, or get personalized advice.',
    'onboarding.featureGuide.chatSection.imageTitle': 'Image Analysis',
    'onboarding.featureGuide.chatSection.imageDesc': 'Send images for AI to analyze and suggest related habits.',
    'onboarding.featureGuide.chatSection.voiceTitle': 'Voice Input',
    'onboarding.featureGuide.chatSection.voiceDesc': 'Use voice messages to interact with your AI coach.',
    'onboarding.featureGuide.chatSection.cannotDoTitle': 'Limitations',
    'onboarding.featureGuide.chatSection.cannotDoDesc': 'AI cannot access external services, browse the web, or share your data.',
    'onboarding.featureGuide.chatSection.tipsTitle': 'Tips',
    'onboarding.featureGuide.chatSection.tipsDesc': 'Be specific in your requests for best results.',
    'onboarding.featureGuide.chatSection.reschedulingTitle': 'Rescheduling',
    'onboarding.featureGuide.chatSection.reschedulingDesc': 'Ask AI to reschedule habits or adjust frequencies.',
    // Calendar section
    'onboarding.featureGuide.calendarSection.colorsTitle': 'Color Coding',
    'onboarding.featureGuide.calendarSection.colorsDesc': 'Days are color-coded by completion rate.',
    'onboarding.featureGuide.calendarSection.dayDetailsTitle': 'Day Details',
    'onboarding.featureGuide.calendarSection.dayDetailsDesc': 'Tap any day to see which habits were completed.',
    'onboarding.featureGuide.calendarSection.navigationTitle': 'Navigation',
    'onboarding.featureGuide.calendarSection.navigationDesc': 'Swipe between months or tap the header to jump to a specific date.',
    'onboarding.featureGuide.calendarSection.streaksTitle': 'Streaks',
    'onboarding.featureGuide.calendarSection.streaksDesc': 'Visual streak indicators show your consistency.',
    'onboarding.featureGuide.calendarSection.googleCalendarTitle': 'Google Calendar',
    'onboarding.featureGuide.calendarSection.googleCalendarDesc': 'Import events from Google Calendar as habits.',
    // Settings section
    'onboarding.featureGuide.settingsSection.colorSchemeTitle': 'Color Scheme',
    'onboarding.featureGuide.settingsSection.colorSchemeDesc': 'Choose from 6 color schemes to personalize your app.',
    'onboarding.featureGuide.settingsSection.languageTitle': 'Language',
    'onboarding.featureGuide.settingsSection.languageDesc': 'Switch between English and Portuguese.',
    'onboarding.featureGuide.settingsSection.aiMemoryTitle': 'AI Memory',
    'onboarding.featureGuide.settingsSection.aiMemoryDesc': 'Tell AI about yourself so it can give personalized advice.',
    'onboarding.featureGuide.settingsSection.aiSummaryTitle': 'AI Summary',
    'onboarding.featureGuide.settingsSection.aiSummaryDesc': 'Set a custom AI summary prompt for your daily overview.',
    'onboarding.featureGuide.settingsSection.userFactsTitle': 'User Facts',
    'onboarding.featureGuide.settingsSection.userFactsDesc': 'Facts AI has learned about you from conversations.',
    'onboarding.featureGuide.settingsSection.timezoneTitle': 'Timezone',
    'onboarding.featureGuide.settingsSection.timezoneDesc': 'Auto-detected. Change manually if traveling.',
    'onboarding.featureGuide.settingsSection.supportTitle': 'Support',
    'onboarding.featureGuide.settingsSection.supportDesc': 'Contact us directly from the app.',
    'onboarding.featureGuide.settingsSection.pushNotificationsTitle': 'Push Notifications',
    'onboarding.featureGuide.settingsSection.pushNotificationsDesc': 'Enable browser notifications for habit reminders.',
    'onboarding.featureGuide.settingsSection.timeFormatTitle': 'Time Format',
    'onboarding.featureGuide.settingsSection.timeFormatDesc': 'Choose 12-hour or 24-hour time display.',
    'onboarding.featureGuide.settingsSection.subscriptionTitle': 'Subscription',
    'onboarding.featureGuide.settingsSection.subscriptionDesc': 'View and manage your plan, billing, and invoices.',
    'onboarding.featureGuide.settingsSection.retrospectiveTitle': 'Retrospective',
    'onboarding.featureGuide.settingsSection.retrospectiveDesc': 'AI-powered review of your habits by period.',
    'onboarding.featureGuide.settingsSection.weekStartDayTitle': 'Week Start Day',
    'onboarding.featureGuide.settingsSection.weekStartDayDesc': 'Choose Monday or Sunday as the first day of your week.',
    'onboarding.featureGuide.settingsSection.referralTitle': 'Referral Program',
    'onboarding.featureGuide.settingsSection.referralDesc': 'Share your referral code and earn discounts.',
    'onboarding.featureGuide.settingsSection.gamificationTitle': 'Gamification',
    'onboarding.featureGuide.settingsSection.gamificationDesc': 'View your level, XP, achievements, and streak stats.',
    'onboarding.featureGuide.settingsSection.widgetTitle': 'Home Widget',
    'onboarding.featureGuide.settingsSection.widgetDesc': 'Add a widget to your home screen for quick habit tracking.',
    'onboarding.featureGuide.settingsSection.showGeneralTodayTitle': 'Show General Today',
    'onboarding.featureGuide.settingsSection.showGeneralTodayDesc': 'Toggle whether general habits appear in today view.',
    // Notifications section
    'onboarding.featureGuide.notificationsSection.bellTitle': 'Notification Bell',
    'onboarding.featureGuide.notificationsSection.bellDesc': 'Check in-app notifications for streaks, achievements, and tips.',
    'onboarding.featureGuide.notificationsSection.managingTitle': 'Managing Notifications',
    'onboarding.featureGuide.notificationsSection.managingDesc': 'Mark as read, delete, or clear all notifications.',
    'onboarding.featureGuide.notificationsSection.configuringRemindersTitle': 'Configuring Reminders',
    'onboarding.featureGuide.notificationsSection.configuringRemindersDesc': 'Set reminder times in each habit\'s settings.',
  }
  return strings[key] ?? key
}

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
    { titleKey: 'onboarding.featureGuide.habitsSection.logNotesTitle', descKey: 'onboarding.featureGuide.habitsSection.logNotesDesc' },
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
    { titleKey: 'onboarding.featureGuide.settingsSection.timeFormatTitle', descKey: 'onboarding.featureGuide.settingsSection.timeFormatDesc' },
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

export function FeatureGuideDrawer({ open, onOpenChange }: FeatureGuideDrawerProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>('habits')

  const items = sectionItems[activeSection]

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('onboarding.featureGuide.title')}>
      <div className="h-[65dvh]">
        {/* Tab bar */}
        <div role="tablist" className="flex flex-wrap gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeSection === tab.key}
              tabIndex={activeSection === tab.key ? 0 : -1}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-150 border ${
                activeSection === tab.key
                  ? 'bg-primary text-white border-primary/30 shadow-[var(--shadow-glow-sm)]'
                  : 'bg-surface-elevated text-text-secondary hover:text-text-primary border-border-muted'
              }`}
              onClick={() => setActiveSection(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.titleKey}>
              <h3 className="text-sm font-bold text-text-primary mb-1">{t(item.titleKey)}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{t(item.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </AppOverlay>
  )
}
