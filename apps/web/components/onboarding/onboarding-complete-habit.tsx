'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useLogHabit } from '@/hooks/use-habits'
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

  const logHabit = useLogHabit()

  const handleComplete = useCallback(() => {
    if (!habitId || isCompleted || isAnimating.current) return

    isAnimating.current = true
    setIsCompleted(true)
    logHabit.mutate({ habitId })

    setTimeout(() => {
      onCompleted()
    }, 1500)
  }, [habitId, isCompleted, logHabit, onCompleted])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, padding: '16px 0' }}>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          lineHeight: 1.15,
          color: 'var(--fg-1)',
        }}
      >
        {t('onboarding.flow.completeHabit.title')}
      </div>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          color: 'var(--fg-2)',
          lineHeight: 1.5,
        }}
      >
        {t('onboarding.flow.completeHabit.instruction')}
      </div>

      {}
      <div
        className="flex items-center"
        style={{
          padding: '14px 4px',
          borderTop: '1px solid var(--hairline)',
          borderBottom: '1px solid var(--hairline)',
          gap: 14,
        }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--fg-1)',
            }}
          >
            {habitTitle}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 12,
              fontStyle: 'italic',
              color: 'var(--fg-3)',
              marginTop: 2,
            }}
          >
            {t('onboarding.flow.completeHabit.tapHint')}
          </div>
        </div>
        <StatusDot
          state={isCompleted ? 'done' : 'empty'}
          size={12}
          onToggle={handleComplete}
          ariaLabel={t('onboarding.flow.completeHabit.tapHint')}
        />
      </div>

      {isCompleted && (
        <div
          className="text-center"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--primary)',
          }}
        >
          {t('onboarding.flow.completeHabit.success')}
        </div>
      )}
    </div>
  )
}
