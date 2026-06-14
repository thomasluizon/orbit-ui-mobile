import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * v8 calendar-import prompt: bottom sheet (title supplied by the sheet header)
 * with body copy, a primary CTA, and a quiet "Not now" link.
 */
export function CalendarImportPrompt() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { profile, invalidate } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [dismissed, setDismissed] = useState(false)

  const shouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      profile?.hasCompletedTour &&
      !profile?.hasImportedCalendar &&
      pathname !== '/calendar-sync' &&
      !dismissed,
  )

  const dismissPrompt = useCallback(async () => {
    setDismissed(true)

    try {
      await performQueuedApiMutation({
        type: 'dismissCalendarPrompt',
        scope: 'calendar',
        endpoint: API.calendar.dismiss,
        method: 'PUT',
        payload: undefined,
        dedupeKey: 'calendar-dismiss-prompt',
      })
    } catch {
    } finally {
      invalidate()
    }
  }, [invalidate])

  const handleImport = useCallback(async () => {
    await dismissPrompt()
    router.push('/calendar-sync' as never)
  }, [dismissPrompt, router])

  if (!shouldShow) return null

  return (
    <BottomSheetModal
      open={shouldShow}
      onClose={() => {
        void dismissPrompt()
      }}
      title={t('onboarding.wizard.calendarTitle')}
      snapPoints={['50%']}
    >
      <View style={styles.content}>
        <Text style={styles.description}>
          {t('onboarding.wizard.calendarDescription')}
        </Text>
        <View style={styles.spacer} />
        <PillButton fullWidth onPress={handleImport}>
          {t('onboarding.wizard.calendarButton')}
        </PillButton>
        <Pressable
          style={styles.quietRow}
          onPress={() => {
            void dismissPrompt()
          }}
          accessibilityRole="button"
        >
          <Text style={styles.quietText}>{t('common.later')}</Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    content: {
      gap: 14,
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: 8,
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: tokens.fg2,
    },
    spacer: {
      height: 16,
    },
    quietRow: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 10,
    },
    quietText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
