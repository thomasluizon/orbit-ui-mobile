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
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
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
  const wide = useIsWideDesktop()

  const hasProAccess = profile?.hasProAccess ?? false
  const locale = profile?.language ?? uiLocale
  const isOverdue = habit?.isOverdue ?? false

  const { suggestion, isLoading, error, refetch } = useRescheduleSuggestion({
    habitId: habit?.id ?? '',
    locale,
    enabled: open && hasProAccess && isOverdue,
  })

  const handleClosed = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  const handleAccept = useCallback(async () => {
    if (!habit || !suggestion) return
    const request = buildRescheduleUpdateRequest(habit, suggestion)
    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: request })
      closeSheet(handleClosed)
    } catch (mutationError: unknown) {
      showError(
        getFriendlyErrorMessage(mutationError, (key, values) => t(key, values), 'errors.updateHabit', 'habit'),
      )
    }
  }, [closeSheet, handleClosed, habit, suggestion, updateHabit, showError, t])

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
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : ''
  const timeLabel = suggestion?.dueTime ? displayTime(suggestion.dueTime) : null

  function renderFooter() {
    if (hasProAccess && isLoading) return null
    const filledVariant = wide ? 'secondary' : 'primary'
    if (!hasProAccess) {
      return (
        <>
          <PillButton variant="ghost" size="sm" onClick={() => closeSheet()}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
          {/* eslint-disable-next-line local/max-button-words -- granted canvas label, Orbit Hoje.dc.html:723-724 (D42) */}
          <PillButton
            variant={filledVariant}
            size="sm"
            onClick={() =>
              closeSheet(() => {
                handleClosed()
                router.push('/upgrade')
              })
            }
          >
            {t('habits.reschedule.upgrade')}
          </PillButton>
        </>
      )
    }
    if (error) {
      return (
        <>
          <PillButton variant="ghost" size="sm" onClick={() => closeSheet()}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
          <PillButton variant={filledVariant} size="sm" onClick={() => void refetch()}>
            {t('habits.reschedule.retry')}
          </PillButton>
        </>
      )
    }
    return (
      <>
        <PillButton variant="ghost" size="sm" disabled={updateHabit.isPending} onClick={() => closeSheet()}>
          {t('habits.reschedule.dismiss')}
        </PillButton>
        {/* eslint-disable-next-line local/max-button-words -- granted canvas label, Orbit Hoje.dc.html:723-724 (D42) */}
        <PillButton
          variant={filledVariant}
          size="sm"
          disabled={!suggestion}
          loading={updateHabit.isPending}
          onClick={() => void handleAccept()}
        >
          {t('habits.reschedule.accept')}
        </PillButton>
      </>
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
        <div className="flex flex-col" style={{ gap: 12 }}>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('habits.reschedule.loading')}
          </p>
          <div data-testid="reschedule-loading-skeleton" className="flex flex-col" style={{ gap: 8 }}>
            <Skeleton variant="habit-row" label={t('habits.reschedule.loading')} />
            <Skeleton variant="habit-row" label={t('habits.reschedule.loading')} />
          </div>
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
          proposedLabel={t('habits.form.proposedByAstra')}
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
      onClose={handleClosed}
      accessibleTitle={t('habits.reschedule.title')}
      actions={renderFooter()}
    >
      <div className="flex flex-col pb-2" style={{ gap: 16 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <AstraGlyph size={20} color="var(--fg-1)" />
          <span
            translate="no"
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
            }}
          >
            Astra
          </span>
          <Badge>{t('aiDisclosure.isAiLabel')}</Badge>
        </div>

        {renderBody()}
      </div>
    </Sheet>) : null
  )
}
