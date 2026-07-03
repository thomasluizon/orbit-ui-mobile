import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Share2 } from 'lucide-react-native'
import { gamificationKeys, referralKeys } from '@orbit/shared/query'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import { canPromptEngagement, parseMilestoneShareKey } from '@orbit/shared/stores'
import { buildReferralUrl } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { useShareCard } from '@/hooks/use-share-card'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import {
  MilestoneShareCard,
  type MilestoneShareVariant,
} from '@/components/milestone-share/milestone-share-card'

const SETTLE_DELAY_MS = 500

function resolveVariant(
  milestoneKey: string,
  profile: GamificationProfile | undefined,
): MilestoneShareVariant | null {
  const parsed = parseMilestoneShareKey(milestoneKey)
  if (!parsed) return null
  if (parsed.kind === 'streak') return { kind: 'streak', streak: parsed.value }

  const achievement = profile?.achievements.find((item) => item.id === parsed.achievementId)
  if (!achievement) return null
  return {
    kind: 'achievement',
    achievementId: achievement.id,
    iconKey: achievement.iconKey,
    rarity: achievement.rarity,
  }
}

/** Curated milestone share nudge: shows a branded card once no celebration is in flight and the shared re-prompt guard allows it, then hands off to the native share sheet. */
export function MilestoneSharePrompt() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const queryClient = useQueryClient()
  const armedPrompt = useEngagementPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useEngagementPromptStore((s) => s.markEngagementPrompted)
  const clearArmedMilestone = useEngagementPromptStore((s) => s.clearArmedMilestone)
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )
  const { shareRef, isSharing, hasError, share } = useShareCard()

  const armedKey = armedPrompt?.kind === 'milestone-share' ? armedPrompt.milestoneKey : null

  const [visibleKey, setVisibleKey] = useState<string | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (visibleKey || !armedKey || celebrationInFlight) return

    const profile = queryClient.getQueryData<GamificationProfile>(gamificationKeys.profile())
    if (
      !resolveVariant(armedKey, profile) ||
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
    visibleKey,
    queryClient,
    markEngagementPrompted,
    clearArmedMilestone,
  ])

  const profile = queryClient.getQueryData<GamificationProfile>(gamificationKeys.profile())
  const variant = visibleKey ? resolveVariant(visibleKey, profile) : null
  const cachedReferral = queryClient.getQueryData<ReferralDashboard>(referralKeys.all)
  const referralUrl = buildReferralUrl(cachedReferral?.code)

  function dismiss() {
    setVisibleKey(null)
  }

  return (
    <BottomSheetModal open={variant !== null} onClose={dismiss} snapPoints={['85%']} contentManagesScroll>
      {variant ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardWrap}>
            <MilestoneShareCard ref={shareRef} variant={variant} referralUrl={referralUrl} />
          </View>

          <Text style={styles.body}>{t('milestoneShare.body')}</Text>

          {hasError ? (
            <Text style={styles.errorText}>{t('milestoneShare.shareError')}</Text>
          ) : null}

          <View style={styles.actions}>
            <PillButton
              fullWidth
              busy={isSharing}
              disabled={isSharing}
              onPress={() => void share(t('milestoneShare.shareTitle'))}
              accessibilityLabel={t('milestoneShare.share')}
              leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
            >
              {t('milestoneShare.share')}
            </PillButton>
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel={t('milestoneShare.later')}
              style={({ pressed }) => [
                styles.laterButton,
                pressed ? styles.laterButtonPressed : null,
              ]}
            >
              {({ pressed }) => (
                <Text style={[styles.laterText, pressed ? styles.laterTextPressed : null]}>
                  {t('milestoneShare.later')}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 28,
      gap: 16,
      alignItems: 'center',
    },
    cardWrap: {
      alignItems: 'center',
    },
    body: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      color: tokens.fg2,
    },
    errorText: {
      textAlign: 'center',
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.statusBad,
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
      transform: [{ scale: 0.98 }],
    },
    laterText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.fg3,
    },
    laterTextPressed: {
      color: tokens.fg1,
    },
  })
}
