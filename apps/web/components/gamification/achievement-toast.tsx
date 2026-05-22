'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror store snapshot into local state
    setCurrentAchievement({
      id: activeAchievement.id,
      achievementId: activeAchievement.payload.achievementId,
      xpReward: activeAchievement.payload.xpReward,
    })
    setShouldRender(true)
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
          padding: '12px 14px',
          background: 'var(--bg-elev)',
          borderRadius: 10,
          boxShadow:
            '0 8px 24px rgba(0,0,0,0.30), inset 0 0 0 1px var(--hairline)',
          gap: 12,
        }}
      >
        {/* Hairline-ringed glyph */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: 32, height: 32, flexShrink: 0 }}
        >
          <svg
            width={32}
            height={32}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0 }}
          >
            <circle
              cx={16}
              cy={16}
              r={14}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1}
            />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 16,
              color: 'var(--fg-1)',
            }}
          >
            {'◆'}
          </span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--fg-3)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {t('gamification.toast.achievementEyebrow', {
              xp: currentAchievement.xpReward,
            })}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {t(`gamification.achievements.${currentAchievement.achievementId}.name`)}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-family-sans)',
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
