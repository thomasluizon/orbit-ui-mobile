'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile } from '@/hooks/use-profile'

export function ProfileStreakCard() {
  const t = useTranslations()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0

  const [displayStreak, setDisplayStreak] = useState(0)
  const frameRef = useRef<number>(undefined)
  const [previousStreak, setPreviousStreak] = useState(streak)

  if (streak !== previousStreak) {
    setPreviousStreak(streak)
    if (streak <= 0) {
      setDisplayStreak(0)
    }
  }

  useEffect(() => {
    if (streak <= 0) return

    const start = performance.now()
    const duration = 800
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
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

  return (
    <Link
      href="/streak"
      className="flex items-center"
      style={{
        padding: '14px 20px',
        gap: 12,
        borderBottom: '1px solid var(--hairline)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--fg-3)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {t('streakDisplay.profile.title')}
        </div>
        {streak > 0 ? (
          <>
            <div
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 28,
                fontWeight: 500,
                color: 'var(--fg-1)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {displayStreak}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--fg-3)',
                marginTop: 4,
              }}
            >
              {plural(
                t('streakDisplay.profile.currentStreak', { count: displayStreak }),
                displayStreak,
              )}
              {encouragement && ` · ${encouragement}`}
            </div>
          </>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontStyle: 'italic',
              color: 'var(--fg-3)',
            }}
          >
            {t('streakDisplay.profile.noStreak')}
          </div>
        )}
      </div>
      <ChevronRight size={16} strokeWidth={1.5} color="var(--fg-4)" />
    </Link>
  )
}
