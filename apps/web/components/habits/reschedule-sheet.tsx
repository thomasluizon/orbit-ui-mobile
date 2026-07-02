'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  computeHabitFrequencyLabel,
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildRescheduleUpdateRequest } from '@/lib/habit-request-builders'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useUpdateHabit } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'

interface RescheduleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
}

/**
 * Astra-branded sheet that proposes an AI reschedule for an overdue habit. Pro users see the
 * suggested schedule plus rationale and can accept it in one tap (applied through the existing
 * habit-update path); free users see an upgrade prompt. Mirrors apps/mobile reschedule-sheet.tsx.
 */
export function RescheduleSheet({ open, onOpenChange, habit }: Readonly<RescheduleSheetProps>) {
  const t = useTranslations()
  const router = useRouter()
  const uiLocale = useLocale()
  const { profile } = useProfile()
  const { displayTime } = useTimeFormat()
  const updateHabit = useUpdateHabit()
  const { showError } = useAppToast()

  const hasProAccess = profile?.hasProAccess ?? false
  const locale = profile?.language ?? uiLocale
  const isOverdue = habit?.isOverdue ?? false

  const { suggestion, isLoading, error, refetch } = useRescheduleSuggestion({
    habitId: habit?.id ?? '',
    locale,
    enabled: open && hasProAccess && isOverdue,
  })

  const handleAccept = useCallback(async () => {
    if (!habit || !suggestion) return
    const request = buildRescheduleUpdateRequest(habit, suggestion)
    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: request })
      onOpenChange(false)
    } catch (mutationError: unknown) {
      showError(
        getFriendlyErrorMessage(mutationError, (key, values) => t(key, values), 'errors.updateHabit', 'habit'),
      )
    }
  }, [habit, suggestion, updateHabit, onOpenChange, showError, t])

  const scheduleLabel = suggestion
    ? computeHabitFrequencyLabel(
        {
          isGeneral: false,
          frequencyUnit: suggestion.frequencyUnit,
          frequencyQuantity: suggestion.frequencyQuantity,
          days: suggestion.days,
          isFlexible: false,
        },
        t,
      )
    : ''
  const dateLabel = suggestion
    ? formatLocaleDate(new Date(`${suggestion.dueDate}T00:00:00`), locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''
  const timeLabel = suggestion?.dueTime ? displayTime(suggestion.dueTime) : null

  function renderFooter() {
    if (!hasProAccess) {
      return (
        <div className="flex flex-col w-full sm:max-w-[360px] sm:mx-auto" style={{ gap: 10 }}>
          <PillButton fullWidth onClick={() => router.push('/upgrade')}>
            {t('habits.reschedule.upgrade')}
          </PillButton>
          <PillButton variant="ghost" fullWidth onClick={() => onOpenChange(false)}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
        </div>
      )
    }
    if (error) {
      return (
        <div className="flex flex-col w-full sm:max-w-[360px] sm:mx-auto" style={{ gap: 10 }}>
          <PillButton fullWidth onClick={() => void refetch()}>
            {t('habits.reschedule.retry')}
          </PillButton>
          <PillButton variant="ghost" fullWidth onClick={() => onOpenChange(false)}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
        </div>
      )
    }
    return (
      <div className="flex flex-col w-full sm:max-w-[360px] sm:mx-auto" style={{ gap: 10 }}>
        <PillButton
          fullWidth
          disabled={!suggestion || updateHabit.isPending}
          dataTestId="reschedule-accept"
          leading={updateHabit.isPending ? <Loader2 className="size-[18px] animate-spin" /> : undefined}
          onClick={() => void handleAccept()}
        >
          {t('habits.reschedule.accept')}
        </PillButton>
        <PillButton variant="ghost" fullWidth disabled={updateHabit.isPending} onClick={() => onOpenChange(false)}>
          {t('habits.reschedule.dismiss')}
        </PillButton>
      </div>
    )
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={t('habits.reschedule.title')}
      footer={renderFooter()}
    >
      <div className="stagger-enter">
        <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} strokeWidth={1.9} color="var(--primary-soft)" aria-hidden="true" />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--primary-soft)',
            }}
          >
            Astra
          </span>
          <span
            title={t('aiDisclosure.isAiTooltip')}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.06em',
              color: 'var(--fg-3)',
              boxShadow: 'inset 0 0 0 1px var(--hairline)',
              borderRadius: 999,
              padding: '1px 7px',
            }}
          >
            {t('aiDisclosure.isAiLabel')}
          </span>
        </div>

        {!hasProAccess ? (
          <p
            data-testid="reschedule-free-prompt"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-2)' }}
          >
            {t('habits.reschedule.freePrompt')}
          </p>
        ) : isLoading ? (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
              {t('habits.reschedule.loading')}
            </p>
            <div
              data-testid="reschedule-loading-skeleton"
              aria-hidden="true"
              className="animate-pulse"
              style={{
                height: 76,
                borderRadius: 18,
                background: 'var(--bg-field)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }}
            />
          </div>
        ) : error ? (
          <p
            data-testid="reschedule-error"
            style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
          >
            {t('habits.reschedule.error')}
          </p>
        ) : suggestion ? (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <div
              className="flex items-center rounded-[18px]"
              style={{
                padding: '14px 16px',
                gap: 12,
                background: 'rgba(var(--primary-rgb), 0.10)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
              }}
            >
              <CalendarClock size={22} strokeWidth={1.9} className="shrink-0 text-[var(--primary-soft)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'var(--fg-3)',
                  }}
                >
                  {t('habits.reschedule.proposedScheduleLabel')}
                </div>
                <div
                  data-testid="reschedule-proposed-schedule"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--fg-1)', marginTop: 2 }}
                >
                  {dateLabel}
                  {timeLabel ? ` · ${timeLabel}` : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--fg-3)', marginTop: 2 }}>
                  {scheduleLabel}
                </div>
              </div>
            </div>

            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-1)', textWrap: 'pretty' }}>
              {suggestion.rationale}
            </p>

            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.4, color: 'var(--fg-3)' }}>
              {t('aiDisclosure.notMedicalAdvice')}
            </p>
          </div>
        ) : null}
      </div>
    </AppOverlay>
  )
}
