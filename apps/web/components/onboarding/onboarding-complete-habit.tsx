'use client'

import { useState, useCallback, useRef } from 'react'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLogHabit } from '@/hooks/use-habits'

interface OnboardingCompleteHabitProps {
  habitId: string | null
  habitTitle: string
  onCompleted: () => void
}

const sparks = [
  { x: '-12px', y: '-16px', delay: '0ms' },
  { x: '14px', y: '-14px', delay: '50ms' },
  { x: '-16px', y: '10px', delay: '100ms' },
  { x: '12px', y: '12px', delay: '150ms' },
]

export function OnboardingCompleteHabit({ habitId, habitTitle, onCompleted }: OnboardingCompleteHabitProps) {
  const t = useTranslations()
  const [isCompleted, setIsCompleted] = useState(false)
  const [showStreak, setShowStreak] = useState(false)
  const [showSparks, setShowSparks] = useState(false)
  const isAnimating = useRef(false)

  const logHabit = useLogHabit()

  const handleComplete = useCallback(async () => {
    if (!habitId || isCompleted || isAnimating.current) return

    isAnimating.current = true
    setIsCompleted(true)
    setShowSparks(true)

    logHabit.mutate({ habitId })

    // Show sparks briefly
    setTimeout(() => {
      setShowSparks(false)
    }, 600)

    // Show streak message after completion animation
    setTimeout(() => {
      setShowStreak(true)
    }, 800)

    // Allow advancing after celebration
    setTimeout(() => {
      onCompleted()
    }, 2200)
  }, [habitId, isCompleted, logHabit, onCompleted])

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-text-primary mb-2 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)]">
        {t('onboarding.flow.completeHabit.title')}
      </h1>
      <p className="text-sm text-text-secondary mb-8 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_100ms_both]">
        {t('onboarding.flow.completeHabit.instruction')}
      </p>

      {/* Simplified habit card */}
      <div
        className={`relative p-4 rounded-[var(--radius-xl)] border text-left animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_200ms_both] ${
          isCompleted ? 'border-primary/20' : 'border-[rgba(255,255,255,0.06)]'
        }`}
        style={{
          background: 'linear-gradient(165deg, rgba(255, 255, 255, 0.035) 0%, transparent 40%), var(--color-surface)',
          boxShadow: isCompleted
            ? '0 4px 12px rgba(0,0,0,0.5), 0 0 20px rgba(var(--primary-shadow), 0.1)'
            : '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Habit info */}
          <div className="min-w-0">
            <p className="text-base font-semibold text-text-primary truncate">{habitTitle}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('onboarding.flow.completeHabit.tapHint')}</p>
          </div>

          {/* Completion circle */}
          <button
            className={`relative shrink-0 size-11 rounded-full transition-all duration-200 touch-target ${
              isCompleted
                ? 'animate-complete-pop'
                : 'border-2 border-border-emphasis animate-[gentle-pulse_2s_ease-in-out_infinite] hover:ring-[3px] hover:ring-primary/15'
            }`}
            style={isCompleted ? {
              background: 'linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, white))',
              boxShadow: '0 0 16px rgba(var(--primary-shadow), 0.4), 0 0 40px rgba(var(--primary-shadow), 0.15)',
            } : undefined}
            disabled={isCompleted}
            onClick={handleComplete}
          >
            {/* Checkmark */}
            {isCompleted && (
              <Check className="size-5 text-white absolute inset-0 m-auto" />
            )}

            {/* Spark particles */}
            {showSparks && sparks.map((spark, i) => (
              <span
                key={i}
                className="absolute top-1/2 left-1/2 size-1.5 rounded-full bg-primary animate-complete-spark"
                style={{
                  '--spark-x': spark.x,
                  '--spark-y': spark.y,
                  animationDelay: spark.delay,
                } as React.CSSProperties}
              />
            ))}

            {/* Glow ring */}
            {isCompleted && (
              <span className="absolute inset-0 rounded-full animate-complete-glow" />
            )}
          </button>
        </div>
      </div>

      {/* Streak message */}
      {showStreak && (
        <div className="mt-6 flex items-center justify-center gap-2 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)]">
          {/* Flame icon */}
          <svg className="size-5" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="onb-flame-grad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fbbf24" />
                <stop offset="0.45" stopColor="#f97316" />
                <stop offset="1" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <path
              d="M12 2C8.5 7 4 9.5 4 14a8 8 0 0016 0c0-4.5-4.5-7-8-12z"
              fill="url(#onb-flame-grad)"
            />
          </svg>
          <span className="text-sm font-semibold text-primary">
            {t('onboarding.flow.completeHabit.success')}
          </span>
        </div>
      )}
    </div>
  )
}
