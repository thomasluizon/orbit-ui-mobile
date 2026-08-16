'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Share2 } from '@/components/ui/icons'
import { gamificationKeys, referralKeys } from '@orbit/shared/query'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import { canPromptEngagement, parseMilestoneShareKey } from '@orbit/shared/stores'
import { buildReferralUrl } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { useShareCard } from '@/hooks/use-share-card'
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

/** Curated milestone share nudge: shows a branded card once no celebration is in flight and the shared re-prompt guard allows it, then hands off to native share/download. */
export function MilestoneSharePrompt() {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const armedPrompt = useEngagementPromptStore((s) => s.armedPrompt)
  const markEngagementPrompted = useEngagementPromptStore((s) => s.markEngagementPrompted)
  const clearArmedMilestone = useEngagementPromptStore((s) => s.clearArmedMilestone)
  const celebrationInFlight = useUIStore(
    (s) => s.activeCelebration !== null || s.queuedCelebrations.length > 0,
  )
  const { captureRef, isSharing, hasError, canShareFiles, share, download } = useShareCard()

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

  function handleShare() {
    void share({
      shareTitle: t('milestoneShare.shareTitle'),
      shareText: t('milestoneShare.shareText'),
      url: referralUrl,
    })
  }

  return (
    <AppOverlay
      open={variant !== null}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      {variant && (
        <div className="flex flex-col items-center" style={{ gap: 16, paddingTop: 4 }}>
          <MilestoneShareCard ref={captureRef} variant={variant} referralUrl={referralUrl} />

          <p
            style={{
              margin: 0,
              textAlign: 'center',
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--fg-2)',
            }}
          >
            {t('milestoneShare.body')}
          </p>

          {hasError && (
            <p role="alert" style={{ textAlign: 'center', fontSize: 13, color: 'var(--status-bad)' }}>
              {t('milestoneShare.shareError')}
            </p>
          )}

          <div className="flex w-full flex-col" style={{ gap: 16, maxWidth: 360, marginInline: 'auto' }}>
            <div className="flex w-full" style={{ gap: 10 }}>
              {canShareFiles && (
                <PillButton
                  className="flex-1"
                  busy={isSharing}
                  disabled={isSharing}
                  onClick={handleShare}
                  leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
                >
                  {t('milestoneShare.share')}
                </PillButton>
              )}
              <PillButton
                className="flex-1"
                variant={canShareFiles ? 'ghost' : 'primary'}
                busy={isSharing}
                disabled={isSharing}
                onClick={() => void download()}
                leading={
                  <Download
                    size={18}
                    strokeWidth={1.8}
                    color={canShareFiles ? 'var(--fg-1)' : 'var(--fg-on-primary)'}
                  />
                }
              >
                {t('milestoneShare.download')}
              </PillButton>
            </div>

            <button
              type="button"
              onClick={dismiss}
              className="w-full text-[var(--fg-3)] hover:text-[var(--fg-1)] active:scale-[0.98] transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
              style={{
                padding: '12px 0',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {t('milestoneShare.later')}
            </button>
          </div>
        </div>
      )}
    </AppOverlay>
  )
}
