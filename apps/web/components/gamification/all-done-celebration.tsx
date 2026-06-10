'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'
import { RingMotif } from './ring-motif'

export function AllDoneCelebration() {
  const t = useTranslations()
  const allDoneCelebration = useUIStore((s) => s.allDoneCelebration)
  const setAllDoneCelebration = useUIStore((s) => s.setAllDoneCelebration)
  const mounted = useIsClient()
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [previousAllDoneCelebration, setPreviousAllDoneCelebration] = useState<
    boolean | undefined
  >(undefined)

  if (allDoneCelebration !== previousAllDoneCelebration) {
    setPreviousAllDoneCelebration(allDoneCelebration)
    if (allDoneCelebration) {
      setShouldRender(true)
    }
  }

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (allDoneCelebration) {
      requestAnimationFrame(() => setIsVisible(true))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        setAllDoneCelebration(false)
        setTimeout(() => setShouldRender(false), 300)
      }, 3500)
    }
  }, [allDoneCelebration, setAllDoneCelebration])

  function dismiss() {
    setIsVisible(false)
    setAllDoneCelebration(false)
    setTimeout(() => setShouldRender(false), 300)
  }

  if (!mounted || !shouldRender) return null

  return createPortal(
    <div role="status" aria-live="polite">
      <button
        type="button"
        aria-label={t('habits.allDoneCelebrationTitle')}
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
          ringSize={280}
          body={t('habits.allDoneCelebrationSubtitle')}
          anchor={
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 500,
                color: 'white',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {t('habits.allDoneCelebrationTitle')}
            </span>
          }
        />
      </button>
    </div>,
    document.body,
  )
}
