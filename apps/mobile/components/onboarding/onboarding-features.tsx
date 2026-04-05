import { View, Text, StyleSheet } from 'react-native'
import { MessageSquare, CalendarDays, Trophy, BellRing } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { colors, radius } from '@/lib/theme'

// ---------------------------------------------------------------------------
// Feature list
// ---------------------------------------------------------------------------

interface FeatureItem {
  Icon: LucideIcon
  titleKey: string
  descKey: string
}

const features: FeatureItem[] = [
  {
    Icon: MessageSquare,
    titleKey: 'onboarding.flow.features.chat.title',
    descKey: 'onboarding.flow.features.chat.desc',
  },
  {
    Icon: CalendarDays,
    titleKey: 'onboarding.flow.features.calendar.title',
    descKey: 'onboarding.flow.features.calendar.desc',
  },
  {
    Icon: Trophy,
    titleKey: 'onboarding.flow.features.achievements.title',
    descKey: 'onboarding.flow.features.achievements.desc',
  },
  {
    Icon: BellRing,
    titleKey: 'onboarding.flow.features.notifications.title',
    descKey: 'onboarding.flow.features.notifications.desc',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingFeatures() {
  const { t } = useTranslation()

  return (
    <View>
      <Text style={styles.title}>
        {t('onboarding.flow.features.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.features.subtitle')}
      </Text>

      <View style={styles.featureList}>
        {features.map((feature) => (
          <View key={feature.titleKey} style={styles.featureCard}>
            <View style={styles.iconContainer}>
              <feature.Icon size={20} color={colors.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>
                {t(feature.titleKey)}
              </Text>
              <Text style={styles.featureDesc}>
                {t(feature.descKey)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  featureList: {
    gap: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 16,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.primary_10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  featureDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
})
