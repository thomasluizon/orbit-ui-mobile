import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Gift } from 'lucide-react-native'
import { referralKeys } from '@orbit/shared/query'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import {
  canPromptReferral,
  parseReferralMilestoneKey,
} from '@orbit/shared/stores'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useReferralPromptStore } from '@/stores/referral-prompt-store'

const SETTLE_DELAY_MS = 500
const DEFAULT_DISCOUNT_PERCENT = 10

function enterAnimation(delayMs: number) {
  return FadeInDown.duration(220)
    .delay(delayMs)
    .reduceMotion(ReduceMotion.System)
}

/** One-shot milestone nudge: shows once no celebration is in flight and the re-prompt guard allows it, then hands off to the referral drawer. */
export function ReferralPrompt() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const queryClient = useQueryClient()
  const armedPrompt = useReferralPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useReferralPromptStore(
    (s) => s.markEngagementPrompted,
  )
  const clearArmedMilestone = useReferralPromptStore(
    (s) => s.clearArmedMilestone,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

  const armedMilestoneKey =
    armedPrompt?.kind === 'referral' ? armedPrompt.milestoneKey : null

  const [visibleKey, setVisibleKey] = useState<string | null>(null)
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
  const discount = cached?.stats.discountPercent ?? DEFAULT_DISCOUNT_PERCENT

  const title =
    milestone?.kind === 'level'
      ? t('referral.prompt.levelTitle', { level: milestone.value })
      : t('referral.prompt.streakTitle', { count: milestone?.value ?? 0 })

  function dismiss() {
    setVisibleKey(null)
  }

  function openDrawer() {
    setVisibleKey(null)
    setShowDrawer(true)
  }

  return (
    <>
      <BottomSheetModal
        open={visibleKey !== null}
        onClose={dismiss}
        title={title}
        contentKey={visibleKey ?? undefined}
        snapPoints={['60%']}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.Text entering={enterAnimation(70)} style={styles.eyebrow}>
            {t('referral.prompt.eyebrow')}
          </Animated.Text>
          <Animated.View entering={enterAnimation(0)} style={styles.heroDisc}>
            <Gift size={30} strokeWidth={1.8} color={tokens.primarySoft} />
          </Animated.View>
          <Animated.Text entering={enterAnimation(70)} style={styles.body}>
            {t('referral.prompt.body', { discount })}
          </Animated.Text>
          <Animated.View entering={enterAnimation(140)} style={styles.actions}>
            <PillButton fullWidth onPress={openDrawer}>
              {t('referral.prompt.cta')}
            </PillButton>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel={t('referral.prompt.later')}
              style={({ pressed }) => [
                styles.laterButton,
                pressed ? styles.laterButtonPressed : null,
              ]}
            >
              <Text style={styles.laterText}>{t('referral.prompt.later')}</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </BottomSheetModal>
      <ReferralDrawer open={showDrawer} onClose={() => setShowDrawer(false)} />
    </>
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
