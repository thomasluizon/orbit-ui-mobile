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
      style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}
    >
      <div className="flex flex-col" style={{ gap: 8 }}>
        <div className="t-h2 text-center text-balance">
          {t('onboarding.flow.completeHabit.title')}
        </div>
        <div className="t-secondary text-center text-balance">
          {t('onboarding.flow.completeHabit.instruction')}
        </div>
      </div>

      <div
        className="flex items-center rounded-[18px]"
        style={{
          padding: 16,
          background: 'var(--bg-card)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          gap: 12,
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
          <div className="t-body font-medium overflow-hidden whitespace-nowrap text-ellipsis">
            {habitTitle}
          </div>
          <div className="t-secondary">
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
          className="t-secondary text-center font-medium"
          style={{ color: 'var(--primary-soft)' }}
        >
          {t('onboarding.flow.completeHabit.success')}
        </div>
      )}
    </div>
  )
}
