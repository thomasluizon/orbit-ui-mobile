'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import type { Achievement } from '@orbit/shared/types/gamification'

interface AchievementToastProps {
  newAchievements: Achievement[]
  onClear: () => void
}

export function AchievementToast({ newAchievements, onClear }: AchievementToastProps) {
  const t = useTranslations()
  const [visible, setVisible] = useState(false)
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null)
  const queueRef = useRef<Achievement[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) return
    const next = queueRef.current.shift() ?? null
    setCurrentAchievement(next)
    setVisible(true)
    setTimeout(() => {
      setVisible(false)
      setTimeout(() => processQueue(), 400)
    }, 4000)
  }, [])

  useEffect(() => {
    if (newAchievements.length > 0) {
      queueRef.current.push(...newAchievements)
      onClear()
      if (!visible) {
        processQueue()
      }
    }
  }, [newAchievements, onClear, processQueue, visible])

  if (!mounted || !visible || !currentAchievement) return null

  return createPortal(
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] max-w-sm w-[calc(100%-2rem)] animate-in slide-in-from-top-4 fade-in duration-400"
      style={{ animationTimingFunction: 'var(--ease-spring)' }}
    >
      <div className="bg-surface-overlay border border-primary/30 rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-lg)] flex items-center gap-3">
        <span className="text-3xl shrink-0">{'\u2B50'}</span>
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
