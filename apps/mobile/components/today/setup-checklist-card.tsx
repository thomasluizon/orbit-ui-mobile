import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react-native'
import type { Profile } from '@orbit/shared/types'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'

const CHECKLIST_ITEMS: readonly { key: string; flag: keyof Profile }[] = [
  { key: 'createHabit', flag: 'hasCreatedFirstHabit' },
  { key: 'logHabit', flag: 'hasLoggedFirstHabit' },
  { key: 'tryAstra', flag: 'hasTriedAstra' },
]

/** Auto-tracked first-run setup checklist on Today; hides once completed or dismissed. */
export function SetupChecklistCard() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { profile } = useProfile()
  const dismissed = useUIStore((state) => state.setupChecklistDismissed)
  const setDismissed = useUIStore((state) => state.setSetupChecklistDismissed)

  if (!profile || dismissed || profile.hasCompletedOnboardingChecklist) {
    return null
  }

  const states = CHECKLIST_ITEMS.map((item) => Boolean(profile[item.flag]))
  const doneCount = states.filter(Boolean).length
  const total = CHECKLIST_ITEMS.length
  const allDone = doneCount === total

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('today.setupChecklist.title')}</Text>
          <Text style={styles.subtitle}>
            {allDone
              ? t('today.setupChecklist.complete')
              : t('today.setupChecklist.subtitle')}
          </Text>
        </View>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('today.setupChecklist.dismiss')}
        >
          <X size={18} strokeWidth={1.8} color={tokens.fg4} />
        </Pressable>
      </View>

      <View style={styles.items}>
        {CHECKLIST_ITEMS.map((item, index) => {
          const done = states[index]
          return (
            <View key={item.key} style={styles.itemRow}>
              <View
                style={[styles.check, done ? styles.checkDone : styles.checkPending]}
              >
                {done ? (
                  <Check size={14} strokeWidth={2.4} color={tokens.fgOnPrimary} />
                ) : null}
              </View>
              <Text style={[styles.itemLabel, done ? styles.itemLabelDone : null]}>
                {t(`today.setupChecklist.items.${item.key}`)}
              </Text>
            </View>
          )
        })}
      </View>

      <Text style={styles.progress}>
        {t('today.setupChecklist.progress', { done: doneCount, total })}
      </Text>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    card: {
      gap: 12,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgCard,
      padding: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    headerText: {
      flex: 1,
      gap: 3,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 18,
      color: tokens.fg1,
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      lineHeight: 18,
      color: tokens.fg3,
    },
    items: {
      gap: 10,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDone: {
      backgroundColor: tokens.primary,
    },
    checkPending: {
      borderWidth: 2,
      borderColor: tokens.hairlineStrong,
    },
    itemLabel: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      color: tokens.fg1,
    },
    itemLabelDone: {
      color: tokens.fg3,
      textDecorationLine: 'line-through',
    },
    progress: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
  })
}
