'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  computeHabitFrequencyLabel,
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { buildRescheduleUpdateRequest } from '@/lib/habit-request-builders'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useUpdateHabit } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { RescheduleProposal } from './reschedule-proposal'

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
  const { sheetRef, closeSheet } = useSheetHost()
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
      closeSheet(() => onOpenChange(false))
    } catch (mutationError: unknown) {
      showError(
        getFriendlyErrorMessage(mutationError, (key, values) => t(key, values), 'errors.updateHabit', 'habit'),
      )
    }
  }, [closeSheet, habit, suggestion, updateHabit, onOpenChange, showError, t])

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
          <PillButton
            onClick={() =>
              closeSheet(() => {
                onOpenChange(false)
                router.push('/upgrade')
              })
            }
          >
            {t('habits.reschedule.upgrade')}
          </PillButton>
          <PillButton variant="ghost" onClick={() => closeSheet()}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
        </div>
      )
    }
    if (error) {
      return (
        <div className="flex flex-col w-full sm:max-w-[360px] sm:mx-auto" style={{ gap: 10 }}>
          <PillButton  onClick={() => void refetch()}>
            {t('habits.reschedule.retry')}
          </PillButton>
          <PillButton variant="ghost"  onClick={() => onOpenChange(false)}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
        </div>
      )
    }
    return (
      <div className="flex flex-col w-full sm:max-w-[360px] sm:mx-auto" style={{ gap: 10 }}>
        <PillButton

          disabled={!suggestion || updateHabit.isPending}


          onClick={() => void handleAccept()}
        >
          {t('habits.reschedule.accept')}
        </PillButton>
        <PillButton variant="ghost"  disabled={updateHabit.isPending} onClick={() => onOpenChange(false)}>
          {t('habits.reschedule.dismiss')}
        </PillButton>
      </div>
    )
  }

  function renderBody() {
    if (!hasProAccess) {
      return (
        <p
          data-testid="reschedule-free-prompt"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-2)' }}
        >
          {t('habits.reschedule.freePrompt')}
        </p>
      )
    }
    if (isLoading) {
      return (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('habits.reschedule.loading')}
          </p>
          <div data-testid="reschedule-loading-skeleton"><Skeleton variant="settings" label={t('habits.reschedule.loading')} /></div>
        </div>
      )
    }
    if (error) {
      return (
        <p
          data-testid="reschedule-error"
          style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}
        >
          {t('habits.reschedule.error')}
        </p>
      )
    }
    if (suggestion) {
      return (
        <RescheduleProposal
          proposedLabel={t('habits.reschedule.proposedScheduleLabel')}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          scheduleLabel={scheduleLabel}
          rationale={suggestion.rationale}
          disclosure={t('aiDisclosure.notMedicalAdvice')}
        />
      )
    }
    return null
  }

  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      title={t('habits.reschedule.title')}
      actions={renderFooter()}
    >
      <div className="stagger-enter">
        <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
          <AstraGlyph size={20} color="var(--fg-3)" />
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
          <Badge variant="outline">{t('aiDisclosure.isAiLabel')}</Badge>
        </div>

        {renderBody()}
      </div>
    </Sheet>) : null
  )
}
