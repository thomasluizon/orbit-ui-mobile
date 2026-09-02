import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

const SETTLE_DELAY_MS = 500

/**
 * One-time LGPD-lawful marketing-email consent nudge. Shows once onboarding is complete, the
 * armed slot holds a consent prompt, and no celebration is in flight — deliberately skipping the
 * shared 14-day cooldown while still recording the prompt so other prompts treat it as recent.
 * Dismissing leaves consent undecided (null) so it can re-ask; an explicit Yes/No persists the
 * decision and the strict `=== null` arming gate prevents it from ever re-showing.
 */
export function MarketingConsentPrompt() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { profile, patchProfile, invalidate } = useProfile()
  const armedPrompt = useReferralPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (s) => s.markEngagementPrompted,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const isArmed = armedPrompt?.kind === 'consent'
  const [visible, setVisible] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      performQueuedApiMutation({
        type: 'setMarketingConsent',
        scope: 'profile',
        endpoint: API.profile.marketingConsent,
        method: 'PUT',
        payload: { enabled },
        dedupeKey: 'profile-marketing-consent',
      }),
    onMutate: (enabled) => {
      const previous = profile?.marketingEmailConsent ?? null
      patchProfile({ marketingEmailConsent: enabled })
      return { previous }
    },
    onError: (
      _err: unknown,
      _enabled: boolean,
      context: { previous?: boolean | null } | undefined,
    ) => {
      patchProfile({ marketingEmailConsent: context?.previous ?? null })
    },
    onSettled: () => {
      invalidate()
    },
  })

  useEffect(() => {
    if (visible || !isArmed || celebrationInFlight) return

    settleTimerRef.current = setTimeout(() => {
      markEngagementPrompted(
        MARKETING_CONSENT_MILESTONE_KEY,
        new Date().toISOString(),
      )
      setVisible(true)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [isArmed, celebrationInFlight, visible, markEngagementPrompted])

  function answer(enabled: boolean) {
    closeSheet(() => {
      setVisible(false)
      mutation.mutate(enabled)
    })
  }

  return (
    visible ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => setVisible(false)}
      title={t('marketingConsent.prompt.title')}
    >
      <View style={styles.content}>
        <Text style={styles.body}>
          {t('marketingConsent.prompt.body')}
        </Text>
        <View style={styles.actions}>
          <PillButton onClick={() => answer(true)}>
            {t('marketingConsent.prompt.accept')}
          </PillButton>
          <Pressable
            onPress={() => answer(false)}
            accessibilityRole="button"
            accessibilityLabel={t('marketingConsent.prompt.decline')}
            style={({ pressed }) => [
              styles.laterButton,
              pressed ? styles.laterButtonPressed : null,
            ]}
          >
            <Text style={styles.laterText}>
              {t('marketingConsent.prompt.decline')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 24,
      gap: 16,
    },
    body: {
      maxWidth: 420,
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: tokens.fg2,
    },
    actions: {
      alignSelf: 'stretch',
      gap: 8,
    },
    laterButton: {
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    laterButtonPressed: {
      opacity: 0.6,
    },
    laterText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
  })
}
