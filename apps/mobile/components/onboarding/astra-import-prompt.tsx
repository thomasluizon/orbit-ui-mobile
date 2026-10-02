import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { hasOpenPromptBlockingOverlay } from '@orbit/shared/stores'
import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { useProfile } from '@/hooks/use-profile'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'
import { PillButton } from '@/components/ui/pill-button'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

/**
 * One-time-per-account post-login "Import from another app?" sheet. Gated on the
 * additive `hasSeenImportPrompt` profile flag and made collision-safe against the
 * calendar-import prompt. The CTA seeds the chat draft and routes to Astra; "Not now"
 * marks the account as having seen the prompt.
 */
export function AstraImportPrompt() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { profile, patchProfile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [dismissed, setDismissed] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const pendingOnboardingAnswers = useOnboardingDraftStore((s) =>
    s.hasPendingAnswers(),
  )
  const astraConversationOpen = useUIStore((state) => state.astraConversationOpen)
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const promptId = useId()
  const sheetMounted = useUIStore((state) => state.openOverlayIds.includes(promptId))
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)

  const calendarPromptWouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      !profile.hasImportedCalendar,
  )

  const shouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      !profile.hasSeenImportPrompt &&
      !calendarPromptWouldShow &&
      !pendingOnboardingAnswers &&
      !astraConversationOpen &&
      pathname !== '/calendar' &&
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
    closeSheet(() => {
      unregisterOpenOverlay(promptId)
      void markSeen()
      useUIStore.getState().setAstraConversationOpen(true)
    })
  }, [closeSheet, markSeen, promptId, t, unregisterOpenOverlay])

  useEffect(() => {
    if (!shouldShow) {
      if (sheetMounted) unregisterOpenOverlay(promptId)
      return
    }
    if (!sheetMounted && !anotherOverlayOpen) useUIStore.getState().tryReservePromptOverlay(promptId)
  }, [anotherOverlayOpen, promptId, sheetMounted, shouldShow, unregisterOpenOverlay])
  useEffect(() => {
    return () => unregisterOpenOverlay(promptId)
  }, [promptId, unregisterOpenOverlay])

  if (!sheetMounted) return null

  return (
    shouldShow ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => {
        unregisterOpenOverlay(promptId)
        void markSeen()
      }}
      title={t('onboarding.wizard.importTitle')}
      actions={(
        <DialogActionPair>
          <PromptQuietAction
            accessibleName={t('onboarding.wizard.importNotNow')}
            onClick={() =>
              closeSheet(() => {
                unregisterOpenOverlay(promptId)
                void markSeen()
              })
            }
          >
            {t('onboarding.wizard.importNotNow')}
          </PromptQuietAction>
          {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
          <PillButton size="sm" onClick={() => void handleImport()}>
            {t('onboarding.wizard.importButton')}
          </PillButton>
        </DialogActionPair>
      )}
    >
      <View>
        <Text style={styles.description}>
          {t('onboarding.wizard.importDescription')}
        </Text>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    description: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      color: tokens.fg2,
    },
  })
}
