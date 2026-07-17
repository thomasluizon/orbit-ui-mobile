'use client'

import {
  useState,
  useEffect,
  useImperativeHandle,
  type Ref,
  useRef,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { useIsClient } from '@/hooks/use-is-client'
import { RingMotif } from './ring-motif'

const streakCountStyle: CSSProperties = {
  marginTop: 12,
  fontFamily: 'var(--font-display)',
  fontSize: 56,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--fg-1)',
  animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
  animationDelay: '220ms',
}

export interface StreakFreezeCelebrationHandle {
  show: () => void
}

export function StreakFreezeCelebration({
  ref,
}: Readonly<{ ref?: Ref<StreakFreezeCelebrationHandle> }>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { displayDate } = useDateFormat()
  const isClient = useIsClient()
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  function show() {
    setShouldRender(true)
    requestAnimationFrame(() => setIsVisible(true))
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => setShouldRender(false), 280)
    }, 3000)
  }

  function dismiss() {
    setIsVisible(false)
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    setTimeout(() => setShouldRender(false), 300)
  }

  useImperativeHandle(ref, () => ({ show }))

  if (!isClient || !shouldRender) return null

  const streak = profile?.currentStreak ?? 0
  const today = displayDate(new Date())

  return createPortal(
    <div role="status" aria-live="polite">
      <div
        className="fixed inset-0 z-celebration flex flex-col"
        style={{
          transition: 'opacity 280ms var(--ease-out)',
          opacity: isVisible ? 1 : 0,
        }}
      >
        <button
          type="button"
          aria-label={t('streakDisplay.freeze.celebrationTitle')}
          className="absolute inset-0 w-full cursor-pointer appearance-none border-none p-0"
          style={{ background: 'var(--bg)', opacity: 0.96 }}
          onClick={dismiss}
        />
        <div
          className="pointer-events-none relative z-[1] flex flex-1 flex-col items-center justify-center"
          style={{ gap: 12, padding: '0 32px' }}
        >
          <div style={{ animation: 'scale-in 0.5s var(--ease-out) both' }}>
            <RingMotif
              ringCount={3}
              ringSize={280}
              dashed
              ringColor="var(--status-frozen)"
              eyebrow={t('streakDisplay.freeze.eyebrow', { date: today })}
              eyebrowColor="var(--status-frozen)"
              anchor={
                <span
                  aria-hidden="true"
                  className="relative flex items-center justify-center rounded-full"
                  style={{
                    width: 120,
                    height: 120,
                    fontSize: 60,
                    background:
                      'color-mix(in srgb, var(--status-frozen) 16%, transparent)',
                    animation: 'fresh-start-orb 0.7s var(--ease-out) both',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="animate-orbit-pulse absolute inset-0 rounded-full"
                    style={{
                      boxShadow:
                        '0 0 60px color-mix(in srgb, var(--status-frozen) 40%, transparent)',
                    }}
                  />
                  {'❄️'}
                </span>
              }
            />
          </div>
          <div style={streakCountStyle}>{streak}</div>
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
            {t('streakDisplay.freeze.celebrationSubtitle')}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
