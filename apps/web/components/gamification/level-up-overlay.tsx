'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'
import './level-up-overlay.css'

interface LevelUpOverlayProps {
  leveledUp: boolean
  newLevel: number | null
  onClear: () => void
}

export function LevelUpOverlay({ leveledUp, newLevel, onClear }: Readonly<LevelUpOverlayProps>) {
  const t = useTranslations()
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)
  const completeActiveCelebration = useUIStore((s) => s.completeActiveCelebration)
  const [level, setLevel] = useState(0)
  const [title, setTitle] = useState('')
  const [mounted, setMounted] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const activeLevelUp =
    activeCelebration?.kind === 'level-up'
      ? activeCelebration
      : null

  useEffect(() => {
    setMounted(true)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (leveledUp && newLevel) {
      enqueueCelebration('level-up', { level: newLevel })
    }
  }, [enqueueCelebration, leveledUp, newLevel])

  const dismiss = useCallback((id?: string) => {
    if (!id) return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

    setIsVisible(false)
    hideTimerRef.current = setTimeout(() => {
      setShouldRender(false)
      completeActiveCelebration(id)
      onClear()
    }, 400)
  }, [completeActiveCelebration, onClear])

  useEffect(() => {
    if (!activeLevelUp) return

    setLevel(activeLevelUp.payload.level)
    setTitle(t(`gamification.levels.${activeLevelUp.payload.level}`))
    setShouldRender(true)
    requestAnimationFrame(() => setIsVisible(true))
    timerRef.current = setTimeout(() => {
      dismiss(activeLevelUp.id)
    }, 3000)
  }, [activeLevelUp, dismiss, t])

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div
      role="alert"
      aria-atomic="true"
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70"
      style={{
        transition: 'opacity 0.5s var(--ease-spring)',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div className="text-center space-y-4 level-up-content">
        {/* Orbital ring animation */}
        <div className="relative mx-auto size-32">
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin-slow shadow-[var(--shadow-glow)]" />
          <div
            className="absolute inset-2 rounded-full border-2 border-primary/50 shadow-[var(--shadow-glow-sm)]"
            style={{ animation: 'spin 6s linear infinite reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-extrabold text-primary">{level}</span>
          </div>
        </div>

        {/* Text */}
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary">
            {t('gamification.levelUp.title')}
          </p>
          <p className="text-2xl font-extrabold text-text-primary mt-1">
            {t('gamification.levelUp.newLevel', { level })}
          </p>
          <p className="text-sm text-text-secondary mt-1">
            {t('gamification.levelUp.subtitle', { title })}
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
