'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useUIStore } from '@/stores/ui-store'
import './streak-celebration.css'

const MILESTONE_VALUES = [7, 14, 30, 100, 365] as const

export function StreakCelebration() {
  const t = useTranslations()
  const streakCelebration = useUIStore((s) => s.streakCelebration)
  const setStreakCelebration = useUIStore((s) => s.setStreakCelebration)
  const [visible, setVisible] = useState(false)
  const [streakCount, setStreakCount] = useState(0)
  const [mounted, setMounted] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setMounted(true)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (streakCelebration) {
      setStreakCount(streakCelebration.streak)
      setVisible(true)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false)
        setStreakCelebration(null)
      }, 2500)
    }
  }, [streakCelebration, setStreakCelebration])

  const isMilestone = useMemo(
    () => (MILESTONE_VALUES as readonly number[]).includes(streakCount),
    [streakCount]
  )

  const encouragement = useMemo(() => {
    if ((MILESTONE_VALUES as readonly number[]).includes(streakCount)) {
      return t('streakDisplay.celebration.milestone')
    }
    return t('streakDisplay.celebration.keepGoing')
  }, [streakCount, t])

  function dismiss() {
    setVisible(false)
    setStreakCelebration(null)
  }

  if (!mounted || !visible) return null

  return createPortal(
    <output
      aria-live="polite"
      className="fixed inset-0 z-[10002] flex items-center justify-center cursor-pointer"
      onClick={dismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75" />

      {/* Ember particles (milestone only) */}
      {isMilestone &&
        Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="streak-ember"
            style={{ '--i': i + 1 } as React.CSSProperties}
          />
        ))}

      {/* Core content */}
      <div className="relative text-center streak-celebration-content">
        {/* Radial glow behind flame */}
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-48 rounded-full blur-3xl opacity-40 ${
            isMilestone ? 'streak-glow-pulse-strong' : 'streak-glow-pulse'
          }`}
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.6), rgba(249,115,22,0.3), transparent 70%)' }}
        />

        {/* Flame icon */}
        <div className={`relative mx-auto mb-3 ${isMilestone ? 'streak-flame-dance-big' : 'streak-flame-dance'}`}>
          <svg viewBox="0 0 64 80" fill="none" className="size-20 mx-auto" style={{ filter: 'drop-shadow(0 0 20px rgba(249,115,22,0.6))' }}>
            <path
              d="M32 0C32 0 8 26 8 48a24 24 0 0 0 48 0C56 26 32 0 32 0Zm0 68a12 12 0 0 1-12-12c0-8 12-22 12-22s12 14 12 22a12 12 0 0 1-12 12Z"
              fill="url(#celebFlameGrad)"
            />
            <defs>
              <linearGradient id="celebFlameGrad" x1="32" y1="0" x2="32" y2="80" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fbbf24" />
                <stop offset="0.45" stopColor="#f97316" />
                <stop offset="1" stopColor="#ef4444" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Streak number */}
        <p className="text-5xl font-extrabold tracking-tight streak-number">
          {streakCount}
        </p>

        {/* Subtitle */}
        <p className="text-sm font-bold uppercase tracking-widest mt-1.5" style={{ color: '#fdba74' }}>
          {plural(t('streakDisplay.celebration.subtitle', { count: streakCount }), streakCount)}
        </p>

        {/* Encouragement */}
        <p className="text-xs text-text-secondary mt-2.5 font-medium">
          {encouragement}
        </p>
      </div>
    </output>,
    document.body
  )
}
