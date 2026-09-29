import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  buildRescheduleUpdateRequest,
  computeHabitFrequencyLabel,
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'
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
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { RescheduleProposal } from './reschedule-proposal'

interface RescheduleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
}

/**
 * Astra-branded sheet that proposes an AI reschedule for an overdue habit. Pro users see the
 * suggested schedule plus rationale and can accept it in one tap (applied through the existing
 * habit-update path); free users see an upgrade prompt. Mirrors apps/web reschedule-sheet.tsx.
 */
export function RescheduleSheet({ open, onOpenChange, habit }: Readonly<RescheduleSheetProps>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  const { displayTime } = useTimeFormat()
  const updateHabit = useUpdateHabit()
  const { showError } = useAppToast()
  const { currentScheme, currentTheme } = useAppTheme()
  const { width } = useWindowDimensions()
  const filledVariant = width >= WIDE_DESKTOP_BREAKPOINT ? 'secondary' : 'primary'
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const hasProAccess = profile?.hasProAccess ?? false
  const locale = profile?.language ?? i18n.language
  const isOverdue = habit?.isOverdue ?? false
  const { sheetRef, closeSheet } = useSheetHost()

  const { suggestion, isLoading, error, refetch } = useRescheduleSuggestion({
    habitId: habit?.id ?? '',
    locale,
    enabled: open && hasProAccess && isOverdue,
  })

  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )

  const handleAccept = useCallback(async () => {
    if (!habit || !suggestion) return
    const request = buildRescheduleUpdateRequest(habit, suggestion)
    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: request })
      closeSheet(() => onOpenChange(false))
    } catch (mutationError: unknown) {
      showError(getFriendlyErrorMessage(mutationError, translate, 'errors.updateHabit', 'habit'))
    }
  }, [closeSheet, habit, suggestion, updateHabit, onOpenChange, showError, translate])

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

  function renderBody() {
    if (!hasProAccess) {
      return (
        <Text style={styles.bodyText}>
          {t('habits.reschedule.freePrompt')}
        </Text>
      )
    }
    if (isLoading) {
      return (
        <View style={styles.suggestionBlock}>
          <Text style={styles.bodyText}>{t('habits.reschedule.loading')}</Text>
          <Skeleton variant="habit-row" label={t('habits.reschedule.loading')} />
          <Skeleton variant="habit-row" grouped />
        </View>
      )
    }
    if (error) {
      return <Text style={styles.bodyText}>{t('habits.reschedule.error')}</Text>
    }
    if (!suggestion) return null
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

  function renderActions() {
    if (hasProAccess && isLoading) return null
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
            onClick={() => {
              closeSheet(() => {
                onOpenChange(false)
                router.push('/upgrade')
              })
            }}
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

  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      accessibleTitle={t('habits.reschedule.title')}
      actions={renderActions()}
    >
      <View style={styles.scrollContent}>
        <View style={styles.headerRow}>
          <AstraGlyph size={20} color={tokens.fg1} />
          <Text style={styles.astraName}>Astra</Text>
          <Badge>{t('aiDisclosure.isAiLabel')}</Badge>
        </View>
        {renderBody()}
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scrollContent: {
      gap: 16,
      paddingBottom: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    astraName: {
      fontFamily: 'Geist_500Medium',
      fontWeight: '500',
      color: tokens.fg1,
    },
    bodyText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 22,
      color: tokens.fg2,
    },
    suggestionBlock: {
      gap: 12,
    },
  })
}
