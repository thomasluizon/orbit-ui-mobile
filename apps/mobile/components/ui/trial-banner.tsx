import { useMemo, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, X } from '@/components/ui/icons'
import { motionEasings } from '@orbit/shared/theme'
import { useProfile, useTrialDaysLeft } from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { toAnimatedEasing } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

export function TrialBanner() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
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
  const translateY = opacity.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0],
  })

  function handleDismiss() {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      easing: toAnimatedEasing(motionEasings.enter),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDismissed(true)
    })
  }

  const isTrialActive = profile?.isTrialActive === true
  const isFree = profile?.hasProAccess === false
  const visible = (isTrialActive || isFree) && !dismissed
  if (!visible) return null

  const label = isTrialActive
    ? (trialDaysLeft ?? 0) === 0
      ? t('trial.banner.lastDay')
      : plural(
          t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
          trialDaysLeft ?? 0,
        )
    : t('trial.banner.freeLine')
  const bannerColors = resolveTrialBannerColors(tokens)

  return (
    <Animated.View
      style={[
        styles.container,
        bannerColors.container,
        { opacity, transform: [{ translateY }] },
      ]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => router.push(buildUpgradeHref(pathname || '/'))}
        accessibilityRole="button"
        accessibilityLabel={t('trial.banner.upgrade')}
        style={({ pressed }) => [
          styles.upgradePress,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.upgradeText, { color: bannerColors.actionColor }]}>
          {t('trial.banner.upgrade')}
        </Text>
        <ChevronRight size={16} strokeWidth={2} color={bannerColors.actionColor} />
      </Pressable>
      <Pressable
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('common.dismiss')}
        style={({ pressed }) => [
          styles.dismissButton,
          pressed ? styles.pressed : null,
        ]}
      >
        <X size={20} strokeWidth={2} color={bannerColors.dismissColor} />
      </Pressable>
    </Animated.View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    label: {
      color: tokens.fg2,
      flex: 1,
      fontFamily: 'RobotoMono_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      lineHeight: 16,
    },
    upgradePress: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
      minHeight: 44,
      paddingHorizontal: 4,
    },
    upgradeText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
    },
    dismissButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    pressed: {
      opacity: 0.72,
      transform: [{ scale: 0.96 }],
    },
  })
}
