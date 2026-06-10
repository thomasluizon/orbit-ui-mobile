import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
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
      !profile?.hasImportedCalendar &&
      pathname !== '/calendar-sync' &&
      !dismissed,
  )

  useEffect(() => {
    if (profile?.hasImportedCalendar) {
       
      setDismissed(true)
    }
  }, [profile?.hasImportedCalendar])

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
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: pressed
                ? tokens.primaryPressed
                : tokens.primary,
            },
          ]}
          onPress={handleImport}
        >
          <Text style={[styles.primaryButtonText, { color: tokens.fgOnPrimary }]}>
            {t('onboarding.wizard.calendarButton')}
          </Text>
        </Pressable>
        <Pressable
          style={styles.quietRow}
          onPress={() => {
            void dismissPrompt()
          }}
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
      fontSize: 14,
      lineHeight: 22,
      color: tokens.fg2,
    },
    spacer: {
      height: 16,
    },
    primaryButton: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 14,
      },
    quietRow: {
      alignItems: 'center',
      paddingVertical: 8,
      paddingBottom: 18,
    },
    quietText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
