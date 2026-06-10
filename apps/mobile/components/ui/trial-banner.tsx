import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  useProfile,
  useTrialDaysLeft,
  useTrialUrgent,
} from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * v8 trial edge banner: borderless hairline-divided strip with quiet sans
 * text and "Upgrade" link on the right. Urgent state swaps copy to italic
 * "Last day" in overdue color.
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

  const visible = profile?.isTrialActive && !dismissed
  if (!visible) return null

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.row}>
        <Text style={styles.leadText}>
          {t('subscription.trial')} ·{' '}
          {trialUrgent ? (
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
          onLongPress={() => setDismissed(true)}
        >
          <Text style={styles.upgradeText}>{t('trial.banner.upgrade')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    leadText: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg2,
    },
    strongText: {
      color: tokens.fg1,
    },
    urgentText: {
      color: tokens.statusOverdue,
      fontStyle: 'italic',
    },
    upgradeText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg1,
      textDecorationLine: 'underline',
      paddingVertical: 4,
    },
  })
}
