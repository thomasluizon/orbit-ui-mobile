'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { RingMotif } from './ring-motif'

export function GoalCompletedCelebration() {
  const t = useTranslations()
  const goalCompletedCelebration = useUIStore((s) => s.goalCompletedCelebration)
  const setGoalCompletedCelebration = useUIStore((s) => s.setGoalCompletedCelebration)
  const [goalName, setGoalName] = useState('')
  const mounted = useIsClient()
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [previousGoalCompletedCelebration, setPreviousGoalCompletedCelebration] =
    useState<typeof goalCompletedCelebration | undefined>(undefined)

  if (goalCompletedCelebration !== previousGoalCompletedCelebration) {
    setPreviousGoalCompletedCelebration(goalCompletedCelebration)
    if (goalCompletedCelebration) {
      setGoalName(goalCompletedCelebration.name)
      setShouldRender(true)
    }
  }

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (goalCompletedCelebration) {
      requestAnimationFrame(() => setIsVisible(true))
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = setTimeout(() => {
        setIsVisible(false)
        setGoalCompletedCelebration(null)
        setTimeout(() => setShouldRender(false), 300)
      }, 3500)
    }
  }, [goalCompletedCelebration, setGoalCompletedCelebration])

  function dismiss() {
    setIsVisible(false)
    setGoalCompletedCelebration(null)
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
          aria-label={t('goals.completedCelebrationTitle')}
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
                  {'🏆'}
                </span>
              }
            />
          </div>
          <h1
            className="text-center"
            style={{
              margin: '12px 0 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--fg-1)',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '220ms',
            }}
          >
            {t('goals.completedCelebrationTitle')}
          </h1>
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
            {t('goals.completedCelebrationLabel', { name: goalName })}
          </p>
          <p
            className="text-center"
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'var(--fg-3)',
              animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
              animationDelay: '340ms',
            }}
          >
            {t('goals.completedCelebrationFiled')}
          </p>
        </div>
        <div
          className="pointer-events-auto relative z-[1]"
          style={{
            padding: '0 24px calc(24px + var(--safe-bottom, 0px))',
            animation: 'slide-up-fade 0.28s var(--ease-out) backwards',
            animationDelay: '380ms',
          }}
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
