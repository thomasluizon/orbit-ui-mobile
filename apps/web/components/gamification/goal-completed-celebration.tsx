'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { useUIStore } from '@/stores/ui-store'
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
      <button
        type="button"
        aria-label={t('goals.completedCelebrationTitle')}
        className="fixed inset-0 z-[10003] flex items-center justify-center cursor-pointer appearance-none border-none p-0 w-full"
        style={{
          background: 'rgba(0,0,0,0.85)',
          transition: 'opacity 300ms ease-out',
          opacity: isVisible ? 1 : 0,
        }}
        onClick={dismiss}
      >
        <RingMotif
          ringCount={4}
          ringSize={130}
          body={t('goals.completedCelebrationFiled')}
          anchor={
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 14,
                fontWeight: 500,
                color: 'white',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
              }}
            >
              {t('goals.completedCelebrationLabel', { name: goalName })}
            </span>
          }
        />
      </button>
    </div>,
    document.body,
  )
}
