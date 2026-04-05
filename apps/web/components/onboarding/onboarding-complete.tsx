'use client'

import { useMemo } from 'react'
import { parseISO, format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { CheckCircle2, Sparkles, BadgeCheck } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'

interface OnboardingCompleteProps {
  createdHabit: string
  createdGoal: boolean
  onFinish: () => void
}

export function OnboardingComplete({ createdHabit, createdGoal, onFinish }: Readonly<OnboardingCompleteProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()

  const formattedTrialEnd = useMemo(() => {
    if (!profile?.trialEndsAt) return ''
    return format(parseISO(profile.trialEndsAt), 'PPP', { locale: dateFnsLocale })
  }, [profile?.trialEndsAt, dateFnsLocale])

  const recapItems = useMemo(() => {
    const items = [
      { key: 'habit', label: t('onboarding.flow.complete.recap.habit'), show: !!createdHabit },
      { key: 'goal', label: t('onboarding.flow.complete.recap.goal'), show: createdGoal },
      { key: 'theme', label: t('onboarding.flow.complete.recap.theme'), show: hasProAccess },
    ]
    return items.filter((item) => item.show)
  }, [createdHabit, createdGoal, hasProAccess])

  return (
    <div className="text-center">
      {/* Celebration icon */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div
            className="absolute inset-0 -m-4 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(var(--primary-shadow), 0.12), transparent 50%)' }}
          />
          <div className="relative size-20 rounded-full bg-primary/10 flex items-center justify-center animate-[scale-in_400ms_cubic-bezier(0.16,1,0.3,1)] animate-complete-glow">
            <BadgeCheck className="size-10 text-primary" />
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-text-primary mb-2 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_100ms_both]">
        {t('onboarding.flow.complete.title')}
      </h1>
      <p className="text-sm text-text-secondary animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_200ms_both]">
        {t('onboarding.flow.complete.subtitle')}
      </p>

      {/* Recap */}
      <div className="mt-6 space-y-2">
        {recapItems.map((item, i) => (
          <div
            key={item.key}
            className="flex items-center justify-center gap-3 text-sm"
            style={{
              animation: `slide-up-fade 400ms cubic-bezier(0.16, 1, 0.3, 1) ${300 + i * 80}ms both`,
            }}
          >
            <CheckCircle2 className="size-4 text-success shrink-0" />
            <span className="text-text-secondary">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Trial info (conditional) */}
      {profile?.isTrialActive && (
        <div className="mt-6 p-4 rounded-[var(--radius-xl)] bg-primary/5 border border-primary/15 text-left animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_500ms_both]">
          <div className="flex items-start gap-3">
            <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {t('onboarding.flow.complete.trialTitle')}
              </p>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                {t('onboarding.flow.complete.trialDesc', { date: formattedTrialEnd })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        className="w-full mt-8 py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-base transition-all active:scale-[0.98] hover:bg-primary/90 animate-[slide-up-fade_400ms_cubic-bezier(0.16,1,0.3,1)_600ms_both]"
        style={{ boxShadow: 'var(--shadow-glow)' }}
        onClick={onFinish}
      >
        {t('onboarding.flow.complete.start')}
      </button>
    </div>
  )
}
