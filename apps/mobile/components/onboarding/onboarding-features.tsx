import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  BellRing,
  CalendarDays,
  ListTree,
  Orbit,
  Trophy,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface FeatureItem {
  Icon: LucideIcon
  titleKey: string
  descKey: string
}

const features: FeatureItem[] = [
  {
    Icon: Orbit,
    titleKey: 'onboarding.flow.features.chat.title',
    descKey: 'onboarding.flow.features.chat.desc',
  },
  {
    Icon: ListTree,
    titleKey: 'onboarding.flow.features.subHabits.title',
    descKey: 'onboarding.flow.features.subHabits.desc',
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

/**
 * v8 step 6: "What else Orbit does." Hairline-divided rows; each row is
 * Icon + bold title + italic muted description.
 */
export function OnboardingFeatures() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('onboarding.flow.features.title')}
      </Text>

      <View style={styles.list}>
        {features.map((feature) => (
          <View key={feature.titleKey} style={styles.row}>
            <feature.Icon size={18} color={tokens.fg2} strokeWidth={1.5} />
            <View style={styles.text}>
              <Text style={styles.featureTitle}>
                {t(feature.titleKey, { defaultValue: feature.titleKey })}
              </Text>
              <Text style={styles.featureDesc}>
                {t(feature.descKey, { defaultValue: feature.descKey })}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      paddingTop: 12,
      paddingBottom: 12,
    },
    title: {
      fontFamily: 'Geist',
      fontSize: 22,
      fontWeight: '600',
      letterSpacing: -0.33,
      lineHeight: 25,
      color: tokens.fg1,
      textAlign: 'center',
      marginBottom: 14,
    },
    list: {
      gap: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    text: {
      flex: 1,
      gap: 2,
    },
    featureTitle: {
      fontFamily: 'Geist',
      fontSize: 15,
      fontWeight: '600',
      color: tokens.fg1,
    },
    featureDesc: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.fg3,
    },
  })
}
