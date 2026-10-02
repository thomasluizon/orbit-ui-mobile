import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  canPromptEngagement,
  hasOpenPromptBlockingOverlay,
  parseReviewMomentKey,
  type ReviewMomentKey,
} from '@orbit/shared/stores'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ActionRow } from '@/components/ui/action-row'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { PillButton } from '@/components/ui/pill-button'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
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
        <ActionRow>
          <PromptQuietAction
            accessibleName={t('reviewMoment.notNow')}
            onClick={requestSnooze}
          >
            {t('reviewMoment.notNow')}
          </PromptQuietAction>
          <PillButton
            size="sm"
            loading={isRequesting}
            disabled={isRequesting}
            onClick={() => void rate()}
          >
            {t('reviewMoment.cta')}
          </PillButton>
        </ActionRow>
      )}
    >
      <View style={styles.content}>
          <View accessible accessibilityRole="image" accessibilityLabel={t('reviewMoment.eyebrow')}>
            <AstraGlyph size={48} />
          </View>
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
  })
}
