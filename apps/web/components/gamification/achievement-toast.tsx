'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useGamificationProfile } from '@/hooks/use-gamification'
import type { Achievement } from '@orbit/shared/types/gamification'

export function AchievementToast() {
  const t = useTranslations()
  const { newAchievements, invalidate } = useGamificationProfile()
  const [visible, setVisible] = useState(false)
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null)
  const queueRef = useRef<Achievement[]>([])
  const [mounted, setMounted] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const visibleRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Keep visibleRef in sync
  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const processQueue = useCallback(() => {
    if (visibleRef.current || queueRef.current.length === 0) return
    const next = queueRef.current.shift() ?? null
    setCurrentAchievement(next)
    setVisible(true)
    setShouldRender(true)
    requestAnimationFrame(() => setIsVisible(true))
    showTimerRef.current = setTimeout(() => {
      setVisible(false)
      setIsVisible(false)
      hideTimerRef.current = setTimeout(() => {
        setShouldRender(false)
        processQueue()
      }, 400)
    }, 4000)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (newAchievements.length > 0) {
      queueRef.current.push(...newAchievements)
      invalidate()
      if (!visibleRef.current) {
        processQueue()
      }
    }
  }, [newAchievements, invalidate, processQueue])

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
            {t(`gamification.achievements.${currentAchievement.id}.name`)}
          </p>
          <p className="text-xs text-text-secondary truncate">
            {t(`gamification.achievements.${currentAchievement.id}.description`)}
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
