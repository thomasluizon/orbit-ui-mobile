import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { referralKeys } from '@orbit/shared/query'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import {
  canPromptReferral,
  parseReferralMilestoneKey,
} from '@orbit/shared/stores'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'
import { useUIStore } from '@/stores/ui-store'

const SETTLE_DELAY_MS = 500

/** One-shot milestone nudge that hands off to the referral drawer. */
export function ReferralPrompt() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const queryClient = useQueryClient()
  const armedPrompt = useReferralPromptStore((state) => state.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (state) => state.markEngagementPrompted,
  )
  const clearArmedMilestone = useReferralPromptStore(
    (state) => state.clearArmedMilestone,
  )
  const celebrationInFlight = useUIStore(
    (state) => state.activeCelebration !== null || state.queuedCelebrations.length > 0,
  )

  const armedMilestoneKey =
    armedPrompt?.kind === 'referral' ? armedPrompt.milestoneKey : null
  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const { sheetRef, closeSheet } = useSheetHost()
  const [showDrawer, setShowDrawer] = useState(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (visibleKey || !armedMilestoneKey || celebrationInFlight) return

    if (
      !canPromptReferral(
        useReferralPromptStore.getState(),
        armedMilestoneKey,
        new Date().toISOString(),
      )
    ) {
      clearArmedMilestone()
      return
    }

    settleTimerRef.current = setTimeout(() => {
      markEngagementPrompted(armedMilestoneKey, new Date().toISOString())
      setVisibleKey(armedMilestoneKey)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [
    armedMilestoneKey,
    celebrationInFlight,
    visibleKey,
    markEngagementPrompted,
    clearArmedMilestone,
  ])

  const milestone = visibleKey ? parseReferralMilestoneKey(visibleKey) : null
  const cached = queryClient.getQueryData<ReferralDashboard>(referralKeys.all)
  const discount = cached?.stats.discountPercent
  const title = milestone?.kind === 'level'
    ? t('referral.prompt.levelTitle', { level: milestone.value })
    : t('referral.prompt.streakTitle', { count: milestone?.value ?? 0 })
  const body = discount == null
    ? t('referral.prompt.bodyFallback')
    : t('referral.prompt.body', { discount })

  function openDrawer() {
    closeSheet(() => {
      setVisibleKey(null)
      setShowDrawer(true)
    })
  }

  return (
    <>
      {visibleKey !== null ? (
        <Sheet
          ref={sheetRef}
          open
          onClose={() => setVisibleKey(null)}
          title={title}
          key={visibleKey}
        >
          <View style={styles.content}>
            <Text style={styles.body}>{body}</Text>
            <View style={styles.actions}>
              <PillButton onClick={openDrawer}>
                {t('referral.prompt.cta')}
              </PillButton>
              <Pressable
                onPress={() => closeSheet()}
                accessibilityRole="button"
                accessibilityLabel={t('referral.prompt.later')}
                style={({ pressed }) => [
                  styles.laterButton,
                  pressed ? styles.laterButtonPressed : null,
                ]}
              >
                <Text style={styles.laterText}>{t('referral.prompt.later')}</Text>
              </Pressable>
            </View>
          </View>
        </Sheet>
      ) : null}
      <ReferralDrawer open={showDrawer} onClose={() => setShowDrawer(false)} />
    </>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
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
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    laterButtonPressed: {
      opacity: 0.6,
      transform: [{ scale: 0.96 }],
    },
    laterText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
  })
}
