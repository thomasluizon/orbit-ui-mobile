import { useMemo, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, X } from 'lucide-react-native'
import { motionEasings } from '@orbit/shared/theme'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialUrgent,
} from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { toAnimatedEasing } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Trial strip: slim primary-tinted band with Rubik lead text, tabular
 * days-left count, and an Upgrade chevron CTA. Urgent state swaps to the
 * amber overdue tint. A visible X dismisses it for the session.
 */
export function TrialBanner() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const router = useRouter()
  const pathname = usePathname()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [dismissed, setDismissed] = useState(false)
  const opacity = useMemo(() => new Animated.Value(1), [])

  function handleDismiss() {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      easing: toAnimatedEasing(motionEasings.standard),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDismissed(true)
    })
  }

  const visible = profile?.isTrialActive && !dismissed
  if (!visible) return null

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity },
        trialUrgent
          ? {
              backgroundColor: rgbaFromHex(tokens.statusOverdue, 0.1),
              borderColor: rgbaFromHex(tokens.statusOverdue, 0.28),
            }
          : {
              backgroundColor: tintFromPrimary(tokens, 0.08),
              borderColor: tintFromPrimary(tokens, 0.18),
            },
      ]}
      accessibilityRole="alert"
    >
      <Text style={styles.leadText}>
        {t('trial.banner.trialEyebrow')} ·{' '}
        {trialDaysLeft === 0 ? (
          <Text style={styles.urgentText}>
            {t('trial.banner.lastDay')}
          </Text>
        ) : (
          <Text style={styles.strongText}>
            {plural(
              t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
              trialDaysLeft ?? 0,
            )}
          </Text>
        )}
      </Text>
      <Pressable
        onPress={() => router.push(buildUpgradeHref(pathname || '/'))}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('trial.banner.upgrade')}
        style={({ pressed }) => [
          styles.upgradePress,
          pressed ? styles.upgradePressed : null,
        ]}
      >
        <Text
          style={[
            styles.upgradeText,
            { color: trialUrgent ? tokens.statusOverdueText : tokens.primarySoft },
          ]}
        >
          {t('trial.banner.upgrade')}
        </Text>
        <ChevronRight
          size={14}
          strokeWidth={2.2}
          color={trialUrgent ? tokens.statusOverdue : tokens.primarySoft}
        />
      </Pressable>
      <Pressable
        onPress={handleDismiss}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityLabel={t('common.dismiss')}
        style={({ pressed }) => [
          styles.dismissButton,
          pressed ? styles.dismissButtonPressed : null,
        ]}
      >
        <X
          size={18}
          strokeWidth={1.8}
          color={trialUrgent ? tokens.statusOverdue : tokens.fg3}
        />
      </Pressable>
    </Animated.View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    leadText: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
    strongText: {
      fontFamily: 'Roboto_400Regular',
      fontVariant: ['tabular-nums'],
      color: tokens.fg1,
    },
    urgentText: {
      color: tokens.statusOverdueText,
    },
    upgradePress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    upgradePressed: {
      opacity: 0.7,
      transform: [{ scale: 0.96 }],
    },
    upgradeText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
    },
    dismissButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: -10,
      marginRight: -8,
    },
    dismissButtonPressed: {
      transform: [{ scale: 0.96 }],
      backgroundColor: tokens.bgElev,
    },
  })
}
