import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { parseISO } from 'date-fns'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { VerifiedBadge } from '@/components/ui/verified-badge'

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  onFinish: () => void
}

/**
 * Tudo certo (allset) step: VerifiedBadge hero, display title, recap rows,
 * trial InfoCard. Preserves trial info + onFinish.
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
      {
        key: 'astra',
        label: t('onboarding.flow.complete.recap.astra'),
        show: true,
      },
    ]
    return items.filter((item) => item.show)
  }, [createdHabit, createdGoal, hasProAccess, t])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <VerifiedBadge size={96} />
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
            <Check size={18} color={tokens.primary} strokeWidth={1.8} />
          </View>
        ))}
      </View>

      {profile?.isTrialActive && (
        <InfoCard
          title={t('onboarding.flow.complete.trialTitle')}
          desc={t('onboarding.flow.complete.trialDesc', {
            date: formattedTrialEnd,
          })}
        />
      )}

      <View style={styles.startBtnWrap}>
        <PillButton fullWidth onPress={onFinish}>
          {t('onboarding.flow.complete.start')}
        </PillButton>
      </View>
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
    title: {
      fontFamily: 'Inter_700Bold',
      fontSize: 34,
      letterSpacing: -0.34,
      lineHeight: 39,
      color: tokens.fg1,
      textAlign: 'center',
      marginTop: 6,
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
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
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg2,
    },
    startBtnWrap: {
      marginTop: 8,
    },
  })
}
