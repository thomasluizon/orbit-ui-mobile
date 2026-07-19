import { useMemo, useState } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the dismiss fade on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Pressable, StyleSheet, Text } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, X } from '@/components/ui/icons'
import { motionEasings } from '@orbit/shared/theme'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialUrgent,
} from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { toAnimatedEasing } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

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
  // react-doctor-disable-next-line rerender-defer-reads-hook -- pathname feeds the upgrade return-path at press time (buildUpgradeHref); expo-router exposes the path only via this hook and the banner is lightweight, so re-rendering on navigation is negligible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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

  const bannerColors = resolveTrialBannerColors(!!trialUrgent, tokens)

  return (
    <Animated.View
      style={[styles.container, { opacity }, bannerColors.container]}
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
          style={[styles.upgradeText, { color: bannerColors.accentColor }]}
        >
          {t('trial.banner.upgrade')}
        </Text>
        <ChevronRight
          size={14}
          strokeWidth={2.2}
          color={bannerColors.chevronColor}
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
          color={bannerColors.dismissColor}
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
      paddingVertical: 8,
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
