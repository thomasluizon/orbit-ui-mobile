import { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { parseISO, format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { CheckCircle2, Sparkles, BadgeCheck } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  onFinish: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingComplete({
  createdHabit,
  createdGoal,
  onFinish,
}: Readonly<OnboardingCompleteProps>) {
  const { t, i18n } = useTranslation()
  const dateFnsLocale = i18n.language === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const formattedTrialEnd = useMemo(() => {
    if (!profile?.trialEndsAt) return ''
    return format(parseISO(profile.trialEndsAt), 'PPP', {
      locale: dateFnsLocale,
    })
  }, [profile?.trialEndsAt, dateFnsLocale])

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
      {/* Celebration icon */}
      <View style={styles.iconWrapper}>
        <View style={styles.iconGlow} />
        <View style={styles.iconCircle}>
          <BadgeCheck size={40} color={colors.primary} />
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>
        {t('onboarding.flow.complete.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.complete.subtitle')}
      </Text>

      {/* Recap */}
      <View style={styles.recapList}>
        {recapItems.map((item) => (
          <View key={item.key} style={styles.recapRow}>
            <CheckCircle2 size={16} color={colors.success} />
            <Text style={styles.recapText}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Trial info */}
      {profile?.isTrialActive && (
        <View style={styles.trialCard}>
          <Sparkles size={20} color={colors.primary} />
          <View style={styles.trialText}>
            <Text style={styles.trialTitle}>
              {t('onboarding.flow.complete.trialTitle')}
            </Text>
            <Text style={styles.trialDesc}>
              {t('onboarding.flow.complete.trialDesc', {
                date: formattedTrialEnd,
              })}
            </Text>
          </View>
        </View>
      )}

      {/* CTA */}
      <TouchableOpacity
        style={styles.startBtn}
        activeOpacity={0.8}
        onPress={onFinish}
      >
        <Text style={styles.startBtnText}>
          {t('onboarding.flow.complete.start')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
    },
    iconWrapper: {
      marginBottom: 24,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconGlow: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.primary_15,
      opacity: 0.5,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary_10,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    },
    recapList: {
      marginTop: 24,
      gap: 8,
    },
    recapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    recapText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    trialCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 24,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.primary_10,
      borderWidth: 1,
      borderColor: colors.primary_15,
      width: '100%',
    },
    trialText: {
      flex: 1,
    },
    trialTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    trialDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: 4,
    },
    startBtn: {
      width: '100%',
      marginTop: 32,
      paddingVertical: 14,
      borderRadius: radius.xl,
      backgroundColor: colors.primary,
      alignItems: 'center',
      ...shadows.sm,
      elevation: 3,
    },
    startBtnText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '700',
    },
  })
}
