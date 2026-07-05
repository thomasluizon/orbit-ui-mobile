'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useOnboardingActions } from './onboarding-actions-context'
import { StatusDot } from '@/components/ui/status-dot'

interface OnboardingCompleteHabitProps {
  habitId: string | null
  habitTitle: string
  onCompleted: () => void
}

export function OnboardingCompleteHabit({
  habitId,
  habitTitle,
  onCompleted,
}: Readonly<OnboardingCompleteHabitProps>) {
  const t = useTranslations()
  const [isCompleted, setIsCompleted] = useState(false)
  const isAnimating = useRef(false)

  const actions = useOnboardingActions()

  const handleComplete = useCallback(() => {
    if (!habitId || isCompleted || isAnimating.current) return

    isAnimating.current = true
    setIsCompleted(true)
    void actions.logHabit(habitId)

    setTimeout(() => {
      onCompleted()
    }, 1500)
  }, [habitId, isCompleted, actions, onCompleted])

  return (
    <div
      className="stagger-enter"
      style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '16px 0' }}
    >
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: 'var(--fg-1)',
        }}
      >
        {t('onboarding.flow.completeHabit.title')}
      </div>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--fg-2)',
          lineHeight: 1.55,
        }}
      >
        {t('onboarding.flow.completeHabit.instruction')}
      </div>

      <div
        className="flex items-center rounded-[18px]"
        style={{
          padding: '14px 16px',
          background: 'var(--bg-card)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          gap: 14,
        }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {habitTitle}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              marginTop: 3,
            }}
          >
            {t('onboarding.flow.completeHabit.tapHint')}
          </div>
        </div>
        <StatusDot
          state={isCompleted ? 'done' : 'empty'}
          size={30}
          onToggle={handleComplete}
          ariaLabel={t('onboarding.flow.completeHabit.tapHint')}
        />
      </div>

      {isCompleted && (
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--primary)',
          }}
        >
          {t('onboarding.flow.completeHabit.success')}
        </div>
      )}
    </div>
  )
}
