'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import './profile-streak-card.css'

export function ProfileStreakCard() {
  const t = useTranslations()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0

  // Count-up animation
  const [displayStreak, setDisplayStreak] = useState(0)
  const frameRef = useRef<number>(undefined)

  useEffect(() => {
    if (streak <= 0) {
      setDisplayStreak(0)
      return
    }

    const start = performance.now()
    const duration = 800
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayStreak(Math.round(from + (streak - from) * eased))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [streak])

  const encouragement = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return t('streakDisplay.profile.encouragement100')
    if (streak >= 30) return t('streakDisplay.profile.encouragement30')
    if (streak >= 14) return t('streakDisplay.profile.encouragement14')
    if (streak >= 7) return t('streakDisplay.profile.encouragement7')
    if (streak >= 1) return t('streakDisplay.profile.encouragement1')
    return ''
  }, [streak, t])

  const tier = useMemo(() => {
    if (streak >= 100) return 'legendary'
    if (streak >= 30) return 'intense'
    if (streak >= 7) return 'strong'
    return 'normal'
  }, [streak])

  return (
    <Link href="/streak" className={`streak-card group streak-card--${tier}`}>
      {/* Ambient glow layer */}
      {streak > 0 && <div className="streak-card__glow" />}

      <div className="relative flex items-center gap-4">
        {/* Flame */}
        <div className="shrink-0">
          {streak > 0 ? (
            <div className="streak-card__flame">
              <svg viewBox="0 0 40 50" fill="none" className="size-11">
                <path
                  d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                  fill="url(#profileFlameGrad)"
                />
                <defs>
                  <linearGradient id="profileFlameGrad" x1="20" y1="0" x2="20" y2="50" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#fbbf24" />
                    <stop offset="0.5" stopColor="#f97316" />
                    <stop offset="1" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          ) : (
            <div className="size-11 flex items-center justify-center rounded-full bg-surface-elevated">
              <svg viewBox="0 0 40 50" fill="none" className="size-7 opacity-30">
                <path
                  d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Streak info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-0.5">
            {t('streakDisplay.profile.title')}
          </p>
          {streak > 0 ? (
            <p className="text-lg font-extrabold streak-card__count">
              {t('streakDisplay.profile.currentStreak', { count: displayStreak })}
            </p>
          ) : (
            <p className="text-sm text-text-secondary font-medium">
              {t('streakDisplay.profile.noStreak')}
            </p>
          )}
          {encouragement && streak > 0 && (
            <p className="text-xs text-text-secondary mt-0.5">
              {encouragement}
            </p>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
      </div>
    </Link>
  )
}
