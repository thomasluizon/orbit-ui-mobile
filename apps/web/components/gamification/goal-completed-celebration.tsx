'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'
import { usePortalContainer } from '@/hooks/use-portal-container'
import './goal-completed-celebration.css'

export function GoalCompletedCelebration() {
  const t = useTranslations()
  const portalContainer = usePortalContainer('goal-completed-celebration')
  const goalCompletedCelebration = useUIStore((s) => s.goalCompletedCelebration)
  const setGoalCompletedCelebration = useUIStore((s) => s.setGoalCompletedCelebration)
  const [visible, setVisible] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [mounted, setMounted] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (goalCompletedCelebration) {
      setGoalName(goalCompletedCelebration.name)
      setVisible(true)
      setShouldRender(true)
      requestAnimationFrame(() => setIsVisible(true))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false)
        setIsVisible(false)
        setGoalCompletedCelebration(null)
        setTimeout(() => setShouldRender(false), 300)
      }, 3500)
    }
  }, [goalCompletedCelebration, setGoalCompletedCelebration])

  function dismiss() {
    setVisible(false)
    setIsVisible(false)
    setGoalCompletedCelebration(null)
    setTimeout(() => setShouldRender(false), 300)
  }

  if (!mounted || !shouldRender) return null

  return portalContainer ? createPortal(
    <div
      className="fixed inset-0 z-[10003] flex items-center justify-center cursor-pointer"
      style={{
        transition: 'opacity 0.3s ease-out',
        opacity: isVisible ? 1 : 0,
      }}
      onClick={dismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Radial glow */}
      <div className="goal-glow" />

      {/* Confetti particles */}
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={`confetti-${i}`}
          className="goal-confetti"
          style={{ '--i': i + 1 } as React.CSSProperties}
        />
      ))}

      {/* Orbit ring shockwaves */}
      <div className="goal-ring goal-ring-1" />
      <div className="goal-ring goal-ring-2" />

      {/* Core content */}
      <div className="relative text-center goal-content">
        {/* Target icon */}
        <div className="goal-icon mx-auto mb-4">
          <svg viewBox="0 0 80 80" fill="none" className="size-20 mx-auto" style={{ filter: 'drop-shadow(0 0 20px rgba(var(--primary-shadow), 0.4))' }}>
            <circle cx="40" cy="40" r="38" fill="var(--color-primary)" opacity="0.12" stroke="var(--color-primary)" strokeWidth="1.5" />
            <circle cx="40" cy="40" r="18" fill="none" stroke="var(--color-primary)" strokeWidth="2" opacity="0.5" />
            <circle cx="40" cy="40" r="10" fill="none" stroke="var(--color-primary)" strokeWidth="2" opacity="0.7" />
            <circle cx="40" cy="40" r="4" fill="var(--color-primary)" />
          </svg>
        </div>

        {/* Title */}
        <p className="goal-title text-3xl font-extrabold tracking-tight">
          {t('goals.completedCelebrationTitle')}
        </p>

        {/* Goal name */}
        <p className="goal-subtitle text-sm text-text-secondary mt-2 font-medium">
          {t('goals.completedCelebrationSubtitle', { name: goalName })}
        </p>
      </div>
    </div>,
    portalContainer
  ) : null
}
