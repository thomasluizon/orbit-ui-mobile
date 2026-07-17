'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useEffectEvent,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useOverlayEscape } from '@/hooks/use-overlay-escape'
import { useUIStore } from '@/stores/ui-store'

const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
  animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
  animationDelay: '160ms',
}

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
      }, 280)
    },
    [completeActiveCelebration, onClear],
  )

  const onAutoDismiss = useEffectEvent((id: string) => dismiss(id))

  useEffect(() => {
    if (!activeLevelUp) return

    requestAnimationFrame(() => setIsVisible(true))
    timerRef.current = setTimeout(() => {
      onAutoDismiss(activeLevelUp.id)
    }, 6000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [activeLevelUp])

  useOverlayEscape({
    open: shouldRender,
    onDismiss: () => dismiss(activeLevelUp?.id),
    restoreFocus: false,
  })

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div
      role="alert"
      aria-atomic="true"
      className="fixed inset-0 z-celebration flex flex-col"
      style={{
        transition: 'opacity 280ms var(--ease-out)',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <button
        type="button"
        aria-label={t('gamification.levelUp.title')}
        className="absolute inset-0 w-full cursor-pointer appearance-none border-none p-0"
        style={{ background: 'var(--bg)', opacity: 0.96 }}
        onClick={() => dismiss(activeLevelUp?.id)}
      />
      <div
        className="pointer-events-none relative z-[1] flex flex-1 flex-col items-center justify-center"
        style={{ gap: 12, padding: '0 32px' }}
      >
        <div style={eyebrowStyle}>{t('gamification.levelUp.title')}</div>

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
          {'⭐'}
        </span>

        <div
          className="relative flex items-center justify-center"
          style={{
            width: 150,
            height: 150,
            animation: 'scale-in 0.5s var(--ease-out) backwards',
            animationDelay: '200ms',
          }}
        >
          <svg
            width={150}
            height={150}
            aria-hidden="true"
            className="absolute inset-0 animate-spin-slow"
            style={{ transform: 'rotate(-18deg)' }}
          >
            <ellipse
              cx={75}
              cy={75}
              rx={72}
              ry={26}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5}
            />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--fg-1)',
            }}
          >
            {String(level).padStart(2, '0')}
          </span>
        </div>

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
          {t('gamification.levelUp.steadyHand')}
        </p>
      </div>
    </div>,
    document.body,
  )
}
