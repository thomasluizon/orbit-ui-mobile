'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'

interface LevelUpOverlayProps {
  leveledUp: boolean
  newLevel: number | null
  onClear: () => void
}

export function LevelUpOverlay({
  leveledUp,
  newLevel,
  onClear,
}: Readonly<LevelUpOverlayProps>) {
  const t = useTranslations()
  const activeCelebration = useUIStore((s) => s.activeCelebration)
  const enqueueCelebration = useUIStore((s) => s.enqueueCelebration)
  const completeActiveCelebration = useUIStore((s) => s.completeActiveCelebration)
  const [level, setLevel] = useState(0)
  const mounted = useIsClient()
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const activeLevelUp =
    activeCelebration?.kind === 'level-up' ? activeCelebration : null
  const [previousActiveLevelUp, setPreviousActiveLevelUp] = useState<
    typeof activeLevelUp | undefined
  >(undefined)

  if (activeLevelUp !== previousActiveLevelUp) {
    setPreviousActiveLevelUp(activeLevelUp)
    if (activeLevelUp) {
      setLevel(activeLevelUp.payload.level)
      setShouldRender(true)
    }
  }

  useEffect(() => {
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

  const dismiss = useCallback(
    (id?: string) => {
      if (!id) return

      if (timerRef.current) clearTimeout(timerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

      setIsVisible(false)
      hideTimerRef.current = setTimeout(() => {
        setShouldRender(false)
        completeActiveCelebration(id)
        onClear()
      }, 400)
    },
    [completeActiveCelebration, onClear],
  )

  useEffect(() => {
    if (!activeLevelUp) return

    requestAnimationFrame(() => setIsVisible(true))
    timerRef.current = setTimeout(() => {
      dismiss(activeLevelUp.id)
    }, 3000)
  }, [activeLevelUp, dismiss])

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div
      role="alert"
      aria-atomic="true"
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.85)',
        transition: 'opacity 300ms ease-out',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div
        className="flex flex-col items-center"
        style={{ gap: 14 }}
      >
        {}
        <div
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          {t('gamification.levelUp.title')}
        </div>

        {}
        <div
          className="relative flex items-center justify-center"
          style={{ width: 130, height: 130 }}
        >
          <svg
            width={130}
            height={130}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              animation: 'spin 8s linear infinite',
              transform: 'rotate(-18deg)',
            }}
          >
            <ellipse
              cx={65}
              cy={65}
              rx={62}
              ry={22}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5}
            />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 80,
              fontWeight: 500,
              color: 'white',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.04em',
            }}
          >
            {String(level).padStart(2, '0')}
          </span>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 16,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {t('gamification.levelUp.steadyHand')}
        </div>
      </div>
    </div>,
    document.body,
  )
}
