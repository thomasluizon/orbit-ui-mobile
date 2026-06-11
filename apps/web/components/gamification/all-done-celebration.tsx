'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
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
      <div
        className="fixed inset-0 z-[10003] flex flex-col"
        style={{
          transition: 'opacity 300ms var(--ease-out)',
          opacity: isVisible ? 1 : 0,
        }}
      >
        <button
          type="button"
          aria-label={t('habits.allDoneCelebrationTitle')}
          className="absolute inset-0 w-full cursor-pointer appearance-none border-none p-0"
          style={{ background: 'var(--bg)', opacity: 0.96 }}
          onClick={dismiss}
        />
        <GradientTop height={520} />
        <div
          className="pointer-events-none relative z-[1] flex flex-1 flex-col items-center justify-center"
          style={{ gap: 12, padding: '0 32px' }}
        >
          <RingMotif
            ringCount={3}
            ringSize={280}
            anchor={
              <span
                aria-hidden="true"
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 120,
                  height: 120,
                  fontSize: 60,
                  background: 'rgba(var(--primary-rgb), 0.16)',
                  boxShadow: '0 0 60px rgba(var(--primary-rgb), 0.4)',
                }}
              >
                {'🎉'}
              </span>
            }
          />
          <h1
            className="text-center"
            style={{
              margin: '12px 0 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
            }}
          >
            {t('habits.allDoneCelebrationTitle')}
          </h1>
          <p
            className="text-center"
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              lineHeight: 1.5,
              color: 'var(--fg-2)',
            }}
          >
            {t('habits.allDoneCelebrationSubtitle')}
          </p>
        </div>
        <div
          className="pointer-events-auto relative z-[1]"
          style={{ padding: '0 24px calc(24px + var(--safe-bottom, 0px))' }}
        >
          <PillButton fullWidth onClick={dismiss}>
            {t('common.continue')}
          </PillButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
