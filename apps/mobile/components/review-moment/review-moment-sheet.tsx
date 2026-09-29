import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canPromptEngagement,
  hasOpenPromptBlockingOverlay,
  parseReviewMomentKey,
  type ReviewMomentKey,
} from '@orbit/shared/stores'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { DialogActionPair } from '@/components/ui/dialog-action-pair'
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
 * Astra-branded review moment: presents once the armed review prompt's celebration has fully
 * settled, with copy referencing the streak or level that triggered it.
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
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const promptId = useId()
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)

  const armedKey = armedPrompt?.kind === 'review' ? armedPrompt.milestoneKey : null

  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const { sheetRef, closeSheet } = useSheetHost()
  const [isRequesting, setIsRequesting] = useState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wasVisibleRef = useRef(false)
  useEffect(() => {
    if (visibleKey) wasVisibleRef.current = true
    else if (wasVisibleRef.current) {
      wasVisibleRef.current = false
      unregisterOpenOverlay(promptId)
    }
  }, [visibleKey, promptId, unregisterOpenOverlay])
  useEffect(() => () => unregisterOpenOverlay(promptId), [promptId, unregisterOpenOverlay])

  useEffect(() => {
    if (visibleKey || !armedKey || celebrationInFlight || anotherOverlayOpen) return

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
      if (!useUIStore.getState().tryReservePromptOverlay(promptId)) return
      markEngagementPrompted(armedKey, new Date().toISOString())
      setVisibleKey(armedKey)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [
    armedKey,
    celebrationInFlight,
    anotherOverlayOpen,
    promptId,
    clearArmedMilestone,
    isEligible,
    markEngagementPrompted,
    visibleKey,
  ])

  const variant: ReviewMomentKey | null = visibleKey
    ? parseReviewMomentKey(visibleKey)
    : null
  const title = variant?.kind === 'streak'
    ? t('reviewMoment.streakTitle', { count: variant.value })
    : variant?.kind === 'level'
      ? t('reviewMoment.levelTitle', { level: variant.value })
      : ''

  function hideAndSnooze() {
    setVisibleKey(null)
    dismiss()
  }

  function requestSnooze() {
    closeSheet()
  }

  async function rate() {
    setIsRequesting(true)
    try {
      await requestReview()
    } finally {
      setIsRequesting(false)
      closeSheet(() => setVisibleKey(null))
    }
  }

  return (
    variant !== null ? (<Sheet
      ref={sheetRef}
      open
      onClose={hideAndSnooze}
      title={title}
      actions={(
        <DialogActionPair>
          <PillButton loading={isRequesting} disabled={isRequesting} onClick={() => void rate()}>
            {t('reviewMoment.cta')}
          </PillButton>
          <Pressable
            onPress={requestSnooze}
            accessibilityRole="button"
            accessibilityLabel={t('reviewMoment.notNow')}
            style={({ pressed }) => [
              styles.notNowButton,
              pressed ? styles.notNowButtonPressed : null,
            ]}
          >
            {({ pressed }) => (
              <Text style={[styles.notNowText, pressed ? styles.notNowTextPressed : null]}>
                {t('reviewMoment.notNow')}
              </Text>
            )}
          </Pressable>
        </DialogActionPair>
      )}
    >
      <View style={styles.content}>
          <AstraAvatar size={48} label={t('reviewMoment.eyebrow')} />
          <Text style={styles.body}>
            {variant.kind === 'streak'
              ? t('reviewMoment.streakBody', { count: variant.value })
              : t('reviewMoment.levelBody', { level: variant.value })}
          </Text>
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 24,
      gap: 16,
      alignItems: 'center',
    },
    body: {
      maxWidth: 420,
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: tokens.fg2,
    },
    notNowButton: {
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    notNowButtonPressed: {
      transform: [{ scale: 0.98 }],
    },
    notNowText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
    notNowTextPressed: {
      color: tokens.fg1,
    },
  })
}
