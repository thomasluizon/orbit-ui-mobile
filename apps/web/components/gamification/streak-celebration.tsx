'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'
import { RingMotif } from './ring-motif'

const MILESTONE_VALUES = [7, 14, 30, 100, 365] as const

export function StreakCelebration() {
  const t = useTranslations()
  const streakCelebration = useUIStore((s) => s.streakCelebration)
  const setStreakCelebration = useUIStore((s) => s.setStreakCelebration)
  const [streakCount, setStreakCount] = useState(0)
  const mounted = useIsClient()
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [previousStreakCelebration, setPreviousStreakCelebration] = useState<
    typeof streakCelebration | undefined
  >(undefined)

  if (streakCelebration !== previousStreakCelebration) {
    setPreviousStreakCelebration(streakCelebration)
    if (streakCelebration) {
      setStreakCount(streakCelebration.streak)
      setShouldRender(true)
    }
  }

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (streakCelebration) {
      requestAnimationFrame(() => setIsVisible(true))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        setStreakCelebration(null)
        setTimeout(() => setShouldRender(false), 300)
      }, 2500)
    }
  }, [streakCelebration, setStreakCelebration])

  const isMilestone = useMemo(
    () => (MILESTONE_VALUES as readonly number[]).includes(streakCount),
    [streakCount],
  )

  const encouragement = useMemo(() => {
    if (isMilestone) {
      return t('streakDisplay.celebration.milestone')
    }
    return t('streakDisplay.celebration.keepGoing')
  }, [isMilestone, t])

  function dismiss() {
    setIsVisible(false)
    setStreakCelebration(null)
    setTimeout(() => setShouldRender(false), 300)
  }

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div role="status" aria-live="polite">
      <button
        type="button"
        aria-label={t('streakDisplay.celebration.subtitle', { count: streakCount })}
        className="fixed inset-0 z-[10002] flex items-center justify-center cursor-pointer appearance-none border-none p-0 w-full"
        style={{
          background: 'rgba(0,0,0,0.85)',
          transition: 'opacity 300ms ease-out',
          opacity: isVisible ? 1 : 0,
        }}
        onClick={dismiss}
      >
        <RingMotif
          ringCount={4}
          ringSize={180}
          eyebrow={t('streakDisplay.celebration.eyebrow')}
          anchor={
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 96,
                fontWeight: 500,
                color: 'white',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.03em',
                lineHeight: 0.9,
              }}
            >
              {streakCount}
            </span>
          }
          body={
            <span>
              {plural(
                t('streakDisplay.celebration.subtitle', { count: streakCount }),
                streakCount,
              )}
              {isMilestone && (
                <>
                  {' '}
                  <span style={{ opacity: 0.7 }}>· {encouragement}</span>
                </>
              )}
            </span>
          }
        />
      </button>
    </div>,
    document.body,
  )
}
