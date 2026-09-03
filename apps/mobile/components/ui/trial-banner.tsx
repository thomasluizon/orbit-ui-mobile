import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useProfile, useTrialDaysLeft } from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useAppTheme } from '@/lib/use-app-theme'

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

  const isTrialActive = profile?.isTrialActive === true
  const isFree = profile?.hasProAccess === false
  const visible = isTrialActive || isFree
  if (!visible) return null

  const label = isTrialActive
    ? (trialDaysLeft ?? 0) === 0
      ? t('trial.banner.lastDay')
      : plural(
          t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }),
          trialDaysLeft ?? 0,
        )
    : t('trial.banner.freeLine')
  return (
    <View
      testID="trial-banner"
      style={styles.container}
    >
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => router.push(buildUpgradeHref(pathname || '/'))}
        accessibilityRole="button"
        style={({ pressed }) => [styles.upgradePress, pressed ? styles.pressed : null]}
      >
        <Text
          numberOfLines={1}
          style={[styles.upgradeText, { color: tokens.fg2 }]}
        >
          {t('trial.banner.upgrade')}
        </Text>
      </Pressable>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      minHeight: 24,
      paddingHorizontal: 0,
    },
    label: {
      color: tokens.fg3,
      fontFamily: 'GeistMono_400Regular',
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      lineHeight: 17,
    },
    upgradePress: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 44,
    },
    upgradeText: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      lineHeight: 17,
      textDecorationLine: 'underline',
    },
    pressed: {
      opacity: 0.7,
    },
  })
}
