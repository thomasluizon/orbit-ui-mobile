'use client'

import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { updateWeekStartDay, updateColorScheme as updateColorSchemeAction } from '@/app/actions/profile'

export function OnboardingWelcome() {
  const t = useTranslations()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { currentScheme, applyScheme } = useColorScheme()

  const weekStartDayMutation = useMutation({
    mutationFn: (day: number) => updateWeekStartDay({ weekStartDay: day }),
  })

  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) => updateColorSchemeAction({ colorScheme: scheme }),
  })

  function handleWeekStartDaySelect(day: number) {
    weekStartDayMutation.mutate(day)
  }

  function handleSchemeSelect(scheme: ColorScheme) {
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

  const weekStartDay = profile?.weekStartDay ?? 1

  return (
    <div className="text-center">
      {/* Logo with ambient glow */}
      <div className="mb-6 flex justify-center">
        <div className="relative">
          <div
            className="absolute inset-0 -m-6 rounded-full opacity-60"
            style={{ background: 'radial-gradient(circle, rgba(var(--primary-shadow), 0.15), transparent 60%)' }}
          />
          <img
            src="/logo-no-bg.png"
            alt="Orbit"
            className="relative size-20 animate-[scale-in_400ms_cubic-bezier(0.16,1,0.3,1)_100ms_both]"
            width={80}
            height={80}
          />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-text-primary mb-3 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_150ms_both]">
        {t('onboarding.flow.welcome.title')}
      </h1>
      <p className="text-base text-text-secondary leading-relaxed mb-8 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_250ms_both]">
        {t('onboarding.flow.welcome.subtitle')}
      </p>

      {/* Week start day */}
      <div className="mb-8 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_350ms_both]">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
          {t('onboarding.flow.welcome.weekStart')}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            className={`px-6 py-3 rounded-[var(--radius-xl)] text-sm font-bold transition-all ${
              weekStartDay === 1
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-border-emphasis'
            }`}
            onClick={() => handleWeekStartDaySelect(1)}
          >
            {t('settings.weekStartDay.monday')}
          </button>
          <button
            className={`px-6 py-3 rounded-[var(--radius-xl)] text-sm font-bold transition-all ${
              weekStartDay === 0
                ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-border-emphasis'
            }`}
            onClick={() => handleWeekStartDaySelect(0)}
          >
            {t('settings.weekStartDay.sunday')}
          </button>
        </div>
      </div>

      {/* Color scheme (Pro/trial only) */}
      {hasProAccess && (
        <div className="animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_450ms_both]">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
            {t('onboarding.flow.welcome.colorScheme')}
          </p>
          <div className="flex gap-3 justify-center">
            {colorSchemeOptions.map((option) => (
              <button
                key={option.value}
                className={`size-10 rounded-full cursor-pointer transition-all duration-200 ${
                  currentScheme === option.value
                    ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                    : 'ring-1 ring-white/10 hover:ring-white/20 hover:scale-105'
                }`}
                style={{
                  backgroundColor: option.color,
                  boxShadow: currentScheme === option.value ? `0 0 12px ${option.color}66` : 'none',
                }}
                aria-label={option.value}
                onClick={() => handleSchemeSelect(option.value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
