'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { useUIStore } from '@/stores/ui-store'

export function AchievementToast() {
  const t = useTranslations()
  const { newAchievements, invalidate } = useGamificationProfile()
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)
  const completeActiveCelebration = useUIStore((s) => s.completeActiveCelebration)
  const [mounted, setMounted] = useState(false)
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
    activeCelebration?.kind === 'achievement'
      ? activeCelebration
      : null

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const dismiss = useCallback((achievementId?: string) => {
    if (!achievementId) return

    if (showTimerRef.current) clearTimeout(showTimerRef.current)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

    setIsVisible(false)
    hideTimerRef.current = setTimeout(() => {
      setShouldRender(false)
      setCurrentAchievement(null)
      completeActiveCelebration(achievementId)
    }, 400)
  }, [completeActiveCelebration])

  useEffect(() => {
    if (!activeAchievement) return

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

  // Cleanup timers on unmount
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
      className="fixed top-6 left-1/2 z-[10000] max-w-sm w-[calc(100%-2rem)]"
      style={{
        transition: 'opacity 0.4s var(--ease-spring), transform 0.4s var(--ease-spring)',
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? 'translate(-50%, 0) scale(1)'
          : 'translate(-50%, -100%) scale(0.95)',
      }}
    >
        <div className="bg-surface-overlay border border-primary/30 rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-lg)] flex items-center gap-3">
          <span className="text-3xl shrink-0" aria-hidden="true">{'\u2B50'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
              {t('gamification.toast.achievementUnlocked')}
            </p>
            <p className="text-sm font-bold text-text-primary truncate">
              {t(`gamification.achievements.${currentAchievement.achievementId}.name`)}
            </p>
            <p className="text-xs text-text-secondary truncate">
              {t(`gamification.achievements.${currentAchievement.achievementId}.description`)}
            </p>
          </div>
          <span className="shrink-0 px-2 py-1 rounded-xl text-xs font-bold text-primary bg-primary/15">
            {t('gamification.toast.xpEarned', { xp: currentAchievement.xpReward })}
          </span>
        </div>
      </div>,
      document.body
  )
}
