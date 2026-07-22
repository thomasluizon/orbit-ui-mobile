import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { useProfile } from '@/hooks/use-profile'
import { useSheetExitAction } from '@/hooks/use-sheet-exit-action'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * One-time-per-account post-login "Import from another app?" sheet. Gated on the
 * additive `hasSeenImportPrompt` profile flag and made collision-safe against the
 * calendar-import prompt. The CTA seeds the chat draft and routes to Astra; "Not now"
 * marks the account as having seen the prompt.
 */
export function AstraImportPrompt() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { profile, patchProfile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [dismissed, setDismissed] = useState(false)
  const [sheetMounted, setSheetMounted] = useState(false)
  const { scheduleExitAction, runExitAction } = useSheetExitAction()
  const pendingOnboardingAnswers = useOnboardingDraftStore((s) =>
    s.hasPendingAnswers(),
  )

  const calendarPromptWouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      profile.hasCompletedTour &&
      !profile.hasImportedCalendar,
  )

  const shouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      profile.hasCompletedTour &&
      !profile.hasSeenImportPrompt &&
      !calendarPromptWouldShow &&
      !pendingOnboardingAnswers &&
      !pathname.startsWith('/chat') &&
      pathname !== '/calendar-sync' &&
      !dismissed,
  )

  const markSeen = useCallback(async () => {
    setDismissed(true)
    patchProfile({ hasSeenImportPrompt: true })

    try {
      await performQueuedApiMutation({
        type: 'dismissImportPrompt',
        scope: 'profile',
        endpoint: API.profile.importPromptDismiss,
        method: 'PUT',
        payload: undefined,
        dedupeKey: 'profile-import-prompt-dismiss',
      })
    } catch {}
  }, [patchProfile])

  const handleImport = useCallback(async () => {
    await AsyncStorage.setItem(
      CHAT_DRAFT_STORAGE_KEY,
      t('onboarding.flow.meetAstra.importPrompt'),
    )
    scheduleExitAction(() => router.replace('/chat'))
    await markSeen()
  }, [markSeen, router, scheduleExitAction, t])

  if (shouldShow && !sheetMounted) {
    setSheetMounted(true)
  }

  if (!sheetMounted) return null

  return (
    <BottomSheetModal
      open={shouldShow}
      onClose={() => {
        void markSeen()
      }}
      onDidDismiss={() => {
        runExitAction()
        setSheetMounted(false)
      }}
      title={t('onboarding.wizard.importTitle')}
      snapPoints={['50%']}
    >
      <View style={styles.content}>
        <Text style={styles.description}>
          {t('onboarding.wizard.importDescription')}
        </Text>
        <View style={styles.spacer} />
        <PillButton fullWidth onPress={() => void handleImport()}>
          {t('onboarding.wizard.importButton')}
        </PillButton>
        <Pressable
          style={styles.quietRow}
          onPress={() => {
            void markSeen()
          }}
          accessibilityRole="button"
        >
          <Text style={styles.quietText}>{t('onboarding.wizard.importNotNow')}</Text>
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
      lineHeight: 21,
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
      fontSize: 14,
      color: tokens.fg2,
    },
  })
}
