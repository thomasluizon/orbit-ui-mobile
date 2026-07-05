import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Mail } from 'lucide-react-native'
import { API } from '@orbit/shared/api'
import { MARKETING_CONSENT_MILESTONE_KEY } from '@orbit/shared/stores'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

const SETTLE_DELAY_MS = 500

function enterAnimation(delayMs: number) {
  return FadeInDown.duration(220).delay(delayMs).reduceMotion(ReduceMotion.System)
}

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
  const { profile, patchProfile } = useProfile()
  const armedPrompt = useReferralPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (s) => s.markEngagementPrompted,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const isArmed = armedPrompt?.kind === 'consent'
  const [visible, setVisible] = useState(false)
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
    setVisible(false)
    mutation.mutate(enabled)
  }

  return (
    <BottomSheetModal
      open={visible}
      onClose={() => setVisible(false)}
      title={t('marketingConsent.prompt.title')}
      snapPoints={['55%']}
      contentManagesScroll
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.Text entering={enterAnimation(70)} style={styles.eyebrow}>
          {t('marketingConsent.prompt.eyebrow')}
        </Animated.Text>
        <Animated.View entering={enterAnimation(0)} style={styles.heroDisc}>
          <Mail size={30} strokeWidth={1.8} color={tokens.primarySoft} />
        </Animated.View>
        <Animated.Text entering={enterAnimation(70)} style={styles.body}>
          {t('marketingConsent.prompt.body')}
        </Animated.Text>
        <Animated.View entering={enterAnimation(140)} style={styles.actions}>
          <PillButton fullWidth onPress={() => answer(true)}>
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
        </Animated.View>
      </ScrollView>
    </BottomSheetModal>
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
      paddingTop: 8,
      paddingBottom: 24,
      gap: 16,
    },
    eyebrow: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    heroDisc: {
      width: 64,
      height: 64,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tintFromPrimary(tokens, 0.15),
    },
    body: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      color: tokens.fg2,
    },
    actions: {
      alignSelf: 'stretch',
      gap: 8,
      paddingTop: 4,
    },
    laterButton: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    laterButtonPressed: {
      opacity: 0.6,
    },
    laterText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
  })
}
