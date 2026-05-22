'use client'

import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { RingMotif } from './ring-motif'

export interface StreakFreezeCelebrationHandle {
  show: () => void
}

export const StreakFreezeCelebration = forwardRef<StreakFreezeCelebrationHandle>(
  function StreakFreezeCelebration(_props, ref) {
    const t = useTranslations()
    const { profile } = useProfile()
    const { displayDate } = useDateFormat()
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

    function show() {
      setShouldRender(true)
      requestAnimationFrame(() => setIsVisible(true))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => setShouldRender(false), 300)
      }, 3000)
    }

    function dismiss() {
      setIsVisible(false)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      setTimeout(() => setShouldRender(false), 300)
    }

    useImperativeHandle(ref, () => ({ show }))

    if (!mounted || !shouldRender) return null

    const streak = profile?.currentStreak ?? 0
    const today = displayDate(new Date())

    return createPortal(
      <div role="status" aria-live="polite">
        <button
          type="button"
          aria-label={t('streakDisplay.freeze.celebrationTitle')}
          className="fixed inset-0 z-[10003] flex items-center justify-center cursor-pointer appearance-none border-none p-0 w-full"
          style={{
            background: 'rgba(0,0,0,0.85)',
            transition: 'opacity 300ms ease-out',
            opacity: isVisible ? 1 : 0,
          }}
          onClick={dismiss}
        >
          <RingMotif
            ringCount={3}
            ringSize={220}
            dashed
            ringColor="var(--status-frozen)"
            eyebrow={t('streakDisplay.freeze.eyebrow', { date: today })}
            eyebrowColor="var(--status-frozen)"
            anchor={
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 64,
                  fontWeight: 500,
                  color: 'white',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.03em',
                }}
              >
                {streak}
              </span>
            }
            body={t('streakDisplay.freeze.celebrationSubtitle')}
          />
        </button>
      </div>,
      document.body,
    )
  },
)
