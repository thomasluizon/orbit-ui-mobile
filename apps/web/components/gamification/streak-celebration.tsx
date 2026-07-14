'use client'

import { useState, useEffect, useRef, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'
import { GradientTop } from '@/components/ui/gradient-top'
import { RingMotif } from './ring-motif'

const MILESTONE_VALUES = [7, 14, 30, 100, 365] as const

const streakCountStyle: CSSProperties = {
  marginTop: 12,
  fontFamily: 'var(--font-display)',
  fontSize: 60,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-1)',
  animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
  animationDelay: '220ms',
}

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
    if (!streakCelebration) return
    requestAnimationFrame(() => setIsVisible(true))
    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false)
      setStreakCelebration(null)
      dismissTimerRef.current = setTimeout(() => setShouldRender(false), 280)
    }, 2500)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
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
      <div
        className="fixed inset-0 z-[10002] flex flex-col"
        style={{
          transition: 'opacity 280ms var(--ease-out)',
          opacity: isVisible ? 1 : 0,
        }}
      >
        <button
          type="button"
          aria-label={t('streakDisplay.celebration.subtitle', { count: streakCount })}
          className="absolute inset-0 w-full cursor-pointer appearance-none border-none p-0"
          style={{ background: 'var(--bg)', opacity: 0.96 }}
          onClick={dismiss}
        />
        <GradientTop height={520} />
        <div
          className="pointer-events-none relative z-[1] flex flex-1 flex-col items-center justify-center"
          style={{ gap: 12, padding: '0 32px' }}
        >
          <div style={{ animation: 'scale-in 0.5s var(--ease-out) both' }}>
            <RingMotif
              ringCount={4}
              ringSize={280}
              eyebrow={t('streakDisplay.celebration.eyebrow')}
              anchor={
                <span
                  aria-hidden="true"
                  className="relative flex items-center justify-center rounded-full"
                  style={{
                    width: 120,
                    height: 120,
                    fontSize: 60,
                    background: 'rgba(var(--primary-rgb), 0.16)',
                    animation: 'fresh-start-orb 0.7s var(--ease-out) both',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="animate-orbit-pulse absolute inset-0 rounded-full"
                    style={{ boxShadow: '0 0 60px rgba(var(--primary-rgb), 0.4)' }}
                  />
                  {'🔥'}
                </span>
              }
            />
          </div>
          <div style={streakCountStyle}>{streakCount}</div>
          <p
            className="text-center"
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              lineHeight: 1.5,
              color: 'var(--fg-2)',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '300ms',
            }}
          >
            {plural(
              t('streakDisplay.celebration.subtitle', { count: streakCount }),
              streakCount,
            )}
            {isMilestone && (
              <>
                {' '}
                <span style={{ color: 'var(--fg-3)' }}>· {encouragement}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
