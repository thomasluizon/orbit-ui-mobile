import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { parseISO } from 'date-fns'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  onFinish: () => void
}

/**
 * v8 final step: filled primary check disc, "You're set." heading, italic
 * subtitle, hairline-divided recap rows. Preserves trial info + onFinish.
 */
export function OnboardingComplete({
  createdHabit,
  createdGoal,
  onFinish,
}: Readonly<OnboardingCompleteProps>) {
  const { t } = useTranslation()
  const { displayDate } = useDateFormat()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const formattedTrialEnd = useMemo(() => {
    if (!profile?.trialEndsAt) return ''
    return displayDate(parseISO(profile.trialEndsAt))
  }, [profile, displayDate])

  const recapItems = useMemo(() => {
    const items = [
      {
        key: 'habit',
        label: t('onboarding.flow.complete.recap.habit'),
        show: !!createdHabit,
      },
      {
        key: 'goal',
        label: t('onboarding.flow.complete.recap.goal'),
        show: createdGoal,
      },
      {
        key: 'theme',
        label: t('onboarding.flow.complete.recap.theme'),
        show: hasProAccess,
      },
    ]
    return items.filter((item) => item.show)
  }, [createdHabit, createdGoal, hasProAccess, t])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View
          style={[styles.checkDisc, { backgroundColor: tokens.primary }]}
        >
          <Check size={30} color={tokens.fgOnPrimary} strokeWidth={2.4} />
        </View>
        <Text style={styles.title}>
          {t('onboarding.flow.complete.title')}
        </Text>
        <Text style={styles.subtitle}>
          {t('onboarding.flow.complete.subtitle')}
        </Text>
      </View>

      <View style={styles.recapList}>
        {recapItems.map((item) => (
          <View key={item.key} style={styles.recapRow}>
            <Text style={styles.recapText}>{item.label}</Text>
            <Check size={15} color={tokens.primary} strokeWidth={1.8} />
          </View>
        ))}
      </View>

      {profile?.isTrialActive && (
        <View style={styles.trialCard}>
          <Text style={styles.trialTitle}>
            {t('onboarding.flow.complete.trialTitle')}
          </Text>
          <Text style={styles.trialDesc}>
            {t('onboarding.flow.complete.trialDesc', {
              date: formattedTrialEnd,
            })}
          </Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.startBtn,
          {
            backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
          },
        ]}
        onPress={onFinish}
      >
        <Text style={[styles.startBtnText, { color: tokens.fgOnPrimary }]}>
          {t('onboarding.flow.complete.start')}
        </Text>
      </Pressable>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      gap: 22,
      paddingTop: 12,
      paddingBottom: 12,
    },
    header: {
      alignItems: 'center',
      gap: 14,
      paddingTop: 14,
    },
    checkDisc: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: 'Geist',
      fontSize: 24,
      fontWeight: '600',
      letterSpacing: -0.48,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Geist',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
      textAlign: 'center',
      maxWidth: 280,
    },
    recapList: {
      gap: 0,
    },
    recapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
    },
    recapText: {
      fontFamily: 'Geist',
      fontSize: 14,
      color: tokens.fg1,
    },
    trialCard: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderColor: tokens.hairline,
      gap: 4,
    },
    trialTitle: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fg1,
    },
    trialDesc: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.fg2,
      lineHeight: 18,
    },
    startBtn: {
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    startBtnText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
  })
}
