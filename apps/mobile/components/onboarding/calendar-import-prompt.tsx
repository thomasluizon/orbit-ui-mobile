import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { hasOpenPromptBlockingOverlay } from '@orbit/shared/stores'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'
import { PillButton } from '@/components/ui/pill-button'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'

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
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const promptId = useId()
  const sheetMounted = useUIStore((state) => state.openOverlayIds.includes(promptId))
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const { sheetRef, closeSheet } = useSheetHost()

  const shouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      !profile.hasImportedCalendar &&
      pathname !== '/calendar' &&
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

  const handleImport = useCallback(() => {
    closeSheet(() => {
      unregisterOpenOverlay(promptId)
      void dismissPrompt()
      router.push('/calendar?import=1')
    })
  }, [closeSheet, dismissPrompt, promptId, router, unregisterOpenOverlay])

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
        void dismissPrompt()
      }}
      title={t('onboarding.wizard.calendarTitle')}
      actions={(
        <DialogActionPair>
          <PromptQuietAction
            accessibleName={t('common.later')}
            onClick={() =>
              closeSheet(() => {
                unregisterOpenOverlay(promptId)
                void dismissPrompt()
              })
            }
          >
            {t('common.later')}
          </PromptQuietAction>
          <PillButton size="sm" onClick={handleImport}>
            {t('onboarding.wizard.calendarButton')}
          </PillButton>
        </DialogActionPair>
      )}
    >
      <View style={styles.content}>
        <Text style={styles.description}>
          {t('onboarding.wizard.calendarDescription')}
        </Text>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    content: {
      paddingTop: 8,
    },
    description: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      color: tokens.fg2,
    },
  })
}
