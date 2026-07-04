import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canPromptEngagement,
  parseReviewMomentKey,
  type ReviewMomentKey,
} from '@orbit/shared/stores'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { AstraAvatar } from '@/components/ui/astra-avatar'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'
import { useReviewReminder } from '@/hooks/use-review-reminder'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'

const SETTLE_DELAY_MS = 500

/**
 * Astra-branded review moment: presents once the armed review prompt's
 * celebration has fully settled, with copy referencing the streak or level
 * that triggered it. Accepting hands off to the native Play in-app review;
 * every dismissal path (swipe, back, "Not now") snoozes via the shared
 * review-reminder guard.
 */
export function ReviewMomentSheet() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { profile } = useProfile()
  const { isEligible, dismiss, requestReview } = useReviewReminder(profile)
  const armedPrompt = useEngagementPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useEngagementPromptStore((s) => s.markEngagementPrompted)
  const clearArmedMilestone = useEngagementPromptStore((s) => s.clearArmedMilestone)
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const armedKey = armedPrompt?.kind === 'review' ? armedPrompt.milestoneKey : null

  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (visibleKey || !armedKey || celebrationInFlight) return

    if (
      !parseReviewMomentKey(armedKey) ||
      !isEligible ||
      !canPromptEngagement(
        useEngagementPromptStore.getState(),
        armedKey,
        new Date().toISOString(),
      )
    ) {
      clearArmedMilestone()
      return
    }

    settleTimerRef.current = setTimeout(() => {
      markEngagementPrompted(armedKey, new Date().toISOString())
      setVisibleKey(armedKey)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [
    armedKey,
    celebrationInFlight,
    clearArmedMilestone,
    isEligible,
    markEngagementPrompted,
    visibleKey,
  ])

  const variant: ReviewMomentKey | null = visibleKey
    ? parseReviewMomentKey(visibleKey)
    : null

  function snoozeAndClose() {
    dismiss()
    setVisibleKey(null)
  }

  async function rate() {
    setIsRequesting(true)
    try {
      await requestReview()
    } finally {
      setIsRequesting(false)
      setVisibleKey(null)
    }
  }

  return (
    <BottomSheetModal open={variant !== null} onClose={snoozeAndClose} snapPoints={['62%']}>
      {variant ? (
        <View style={styles.content}>
          <AstraAvatar size={96} animate label={t('reviewMoment.eyebrow')} />
          <Text style={styles.eyebrow}>{t('reviewMoment.eyebrow')}</Text>
          <Text style={styles.title}>
            {variant.kind === 'streak'
              ? t('reviewMoment.streakTitle', { count: variant.value })
              : t('reviewMoment.levelTitle', { level: variant.value })}
          </Text>
          <Text style={styles.body}>
            {variant.kind === 'streak'
              ? t('reviewMoment.streakBody', { count: variant.value })
              : t('reviewMoment.levelBody', { level: variant.value })}
          </Text>

          <View style={styles.actions}>
            <PillButton
              fullWidth
              busy={isRequesting}
              disabled={isRequesting}
              onPress={() => void rate()}
              accessibilityLabel={t('reviewMoment.cta')}
            >
              {t('reviewMoment.cta')}
            </PillButton>
            <Pressable
              onPress={snoozeAndClose}
              accessibilityRole="button"
              accessibilityLabel={t('reviewMoment.notNow')}
              style={({ pressed }) => [
                styles.notNowButton,
                pressed ? styles.notNowButtonPressed : null,
              ]}
            >
              {({ pressed }) => (
                <Text
                  style={[styles.notNowText, pressed ? styles.notNowTextPressed : null]}
                >
                  {t('reviewMoment.notNow')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 28,
      gap: 12,
      alignItems: 'center',
    },
    eyebrow: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    title: {
      fontFamily: 'Inter_700Bold',
      fontSize: 28,
      letterSpacing: -0.56,
      textAlign: 'center',
      color: tokens.fg1,
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
      paddingTop: 12,
    },
    notNowButton: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    notNowButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    notNowText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
    notNowTextPressed: {
      color: tokens.fg1,
    },
  })
}
