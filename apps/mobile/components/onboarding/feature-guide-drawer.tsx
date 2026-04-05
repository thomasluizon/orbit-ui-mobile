import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { colors, radius, shadows } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Section types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FeatureGuideDrawerProps {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeatureGuideDrawer({ open, onClose }: Readonly<FeatureGuideDrawerProps>) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<SectionKey>('habits')

  const items = sectionItems[activeSection]

  return (
    <BottomSheetModal
      open={open}
      onClose={onClose}
      title={t('onboarding.featureGuide.title')}
      snapPoints={['70%', '90%']}
    >
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                activeSection === tab.key && styles.tabActive,
              ]}
              activeOpacity={0.7}
              onPress={() => setActiveSection(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeSection === tab.key && styles.tabTextActive,
                ]}
              >
                {t(tab.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Section content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sectionContent}
      >
        {items.map((item) => (
          <View key={item.titleKey} style={styles.sectionItem}>
            <Text style={styles.sectionTitle}>{t(item.titleKey)}</Text>
            <Text style={styles.sectionDesc}>{t(item.descKey)}</Text>
          </View>
        ))}
      </ScrollView>
    </BottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  tabBar: {
    marginBottom: 16,
  },
  tabBarContent: {
    gap: 8,
    paddingRight: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary_30,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  sectionContent: {
    gap: 16,
    paddingBottom: 24,
  },
  sectionItem: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
})
