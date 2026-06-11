'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Trophy } from 'lucide-react'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'

export function AchievementToast() {
  const t = useTranslations()
  const { newAchievements, invalidate } = useGamificationProfile()
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)
  const completeActiveCelebration = useUIStore((s) => s.completeActiveCelebration)
  const mounted = useIsClient()
  const [currentAchievement, setCurrentAchievement] = useState<{
    id: string
    achievementId: string
    xpReward: number
  } | null>(null)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAchievement =
    activeCelebration?.kind === 'achievement' ? activeCelebration : null
  const [previousActiveAchievement, setPreviousActiveAchievement] = useState<
    typeof activeAchievement | undefined
  >(undefined)

  if (activeAchievement !== previousActiveAchievement) {
    setPreviousActiveAchievement(activeAchievement)
    if (activeAchievement) {
      setCurrentAchievement({
        id: activeAchievement.id,
        achievementId: activeAchievement.payload.achievementId,
        xpReward: activeAchievement.payload.xpReward,
      })
      setShouldRender(true)
    }
  }

  useEffect(() => {
    if (newAchievements.length === 0) return

    for (const achievement of newAchievements) {
      enqueueCelebration('achievement', {
        achievementId: achievement.id,
        xpReward: achievement.xpReward,
      })
    }

    invalidate()
  }, [enqueueCelebration, invalidate, newAchievements])

  const dismiss = useCallback(
    (achievementId?: string) => {
      if (!achievementId) return

      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

      setIsVisible(false)
      hideTimerRef.current = setTimeout(() => {
        setShouldRender(false)
        setCurrentAchievement(null)
        completeActiveCelebration(achievementId)
      }, 400)
    },
    [completeActiveCelebration],
  )

  useEffect(() => {
    if (!activeAchievement) return

    requestAnimationFrame(() => setIsVisible(true))

    if (showTimerRef.current) clearTimeout(showTimerRef.current)
    showTimerRef.current = setTimeout(() => {
      dismiss(activeAchievement.id)
    }, 4000)
  }, [activeAchievement, dismiss])

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!mounted || !shouldRender || !currentAchievement) return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed left-1/2"
      style={{
        top: 56,
        maxWidth: 380,
        width: 'calc(100% - 32px)',
        transition: 'opacity 400ms ease-out, transform 400ms ease-out',
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'translate(-50%, 0) scale(1)'
          : 'translate(-50%, -100%) scale(0.96)',
        zIndex: 10000,
      }}
    >
      <div
        className="flex items-start"
        style={{
          padding: '14px 16px',
          background: 'var(--bg-sheet)',
          borderRadius: 18,
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.5), inset 0 0 0 1px var(--hairline)',
          gap: 12,
        }}
      >
        <div
          aria-hidden="true"
          className="flex items-center justify-center rounded-full"
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            background: 'rgba(var(--primary-rgb), 0.16)',
          }}
        >
          <Trophy size={17} strokeWidth={2.2} color="var(--primary-soft)" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--primary-soft)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t('gamification.toast.achievementEyebrow', {
              xp: currentAchievement.xpReward,
            })}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {t(`gamification.achievements.${currentAchievement.achievementId}.name`)}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
            }}
          >
            {t(
              `gamification.achievements.${currentAchievement.achievementId}.description`,
            )}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
