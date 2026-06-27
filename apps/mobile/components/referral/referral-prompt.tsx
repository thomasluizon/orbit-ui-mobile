import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
  const armedMilestoneKey = useReferralPromptStore((s) => s.armedMilestoneKey)
  const markReferralPrompted = useReferralPromptStore(
    (s) => s.markReferralPrompted,
  )
  const clearArmedMilestone = useReferralPromptStore(
    (s) => s.clearArmedMilestone,
  )
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )

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
      markReferralPrompted(armedMilestoneKey, new Date().toISOString())
      setVisibleKey(armedMilestoneKey)
    }, SETTLE_DELAY_MS)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [
    armedMilestoneKey,
    celebrationInFlight,
    visibleKey,
    markReferralPrompted,
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
        snapPoints={['50%']}
      >
        <View style={styles.content}>
          <Text style={styles.eyebrow}>{t('referral.prompt.eyebrow')}</Text>
          <View style={styles.heroDisc}>
            <Gift size={30} strokeWidth={1.8} color={tokens.primarySoft} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            {t('referral.prompt.body', { discount })}
          </Text>
          <View style={styles.actions}>
            <PillButton fullWidth onPress={openDrawer}>
              {t('referral.prompt.cta')}
            </PillButton>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel={t('referral.prompt.later')}
              style={styles.laterButton}
            >
              <Text style={styles.laterText}>{t('referral.prompt.later')}</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheetModal>
      <ReferralDrawer open={showDrawer} onClose={() => setShowDrawer(false)} />
    </>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    content: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 24,
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
      backgroundColor: tintFromPrimary(tokens, 0.16),
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 22,
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
      paddingTop: 4,
    },
    laterButton: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    laterText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
  })
}
