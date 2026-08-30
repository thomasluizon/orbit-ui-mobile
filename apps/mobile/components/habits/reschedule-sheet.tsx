import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  buildRescheduleUpdateRequest,
  computeHabitFrequencyLabel,
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
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
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
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
        month: 'short',
        day: 'numeric',
        year: 'numeric',
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
          <Skeleton variant="settings" label={t('habits.reschedule.loading')} />
        </View>
      )
    }
    if (error) {
      return <Text style={styles.bodyText}>{t('habits.reschedule.error')}</Text>
    }
    if (!suggestion) return null
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

  function renderActions() {
    if (!hasProAccess) {
      return (
        <View style={styles.actions}>
          <PillButton

            onClick={() => {
              closeSheet(() => {
                onOpenChange(false)
                router.push('/upgrade')
              })
            }}
          >
            {t('habits.reschedule.upgrade')}
          </PillButton>
          <PillButton variant="ghost" onClick={() => closeSheet()}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
        </View>
      )
    }
    if (error) {
      return (
        <View style={styles.actions}>
          <PillButton  onClick={() => void refetch()}>
            {t('habits.reschedule.retry')}
          </PillButton>
          <PillButton variant="ghost" onClick={() => closeSheet()}>
            {t('habits.reschedule.dismiss')}
          </PillButton>
        </View>
      )
    }
    return (
      <View style={styles.actions}>
        <PillButton

          disabled={!suggestion || updateHabit.isPending}
          loading={updateHabit.isPending}
          onClick={() => void handleAccept()}
        >
          {t('habits.reschedule.accept')}
        </PillButton>
        <PillButton
          variant="ghost"
          disabled={updateHabit.isPending}
          onClick={() => closeSheet()}
        >
          {t('habits.reschedule.dismiss')}
        </PillButton>
      </View>
    )
  }

  return (
    open ? (<Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      title={t('habits.reschedule.title')}
    >
      <View style={styles.scrollContent}>
        <View style={styles.headerRow}>
          <AstraGlyph size={20} color={tokens.fg3} />
          <Text style={styles.eyebrow}>Astra</Text>
          <Badge variant="outline">{t('aiDisclosure.isAiLabel')}</Badge>
        </View>
        {renderBody()}
      </View>
      <View style={styles.actionsFooter}>{renderActions()}</View>
    </Sheet>) : null
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 22,
      paddingTop: 4,
      paddingBottom: 14,
      gap: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    eyebrow: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: tokens.primarySoft,
    },
    aiBadge: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 10,
      letterSpacing: 0.6,
      color: tokens.fg3,
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 1,
      overflow: 'hidden',
    },
    bodyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg2,
    },
    suggestionBlock: {
      gap: 14,
    },
    loadingCard: {
      borderRadius: 18,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    scheduleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: tintFromPrimary(tokens, 0.1),
      borderWidth: 1,
      borderColor: tintFromPrimary(tokens, 0.28),
    },
    scheduleTextWrap: {
      flex: 1,
    },
    scheduleLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    scheduleValue: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
      marginTop: 2,
    },
    scheduleSub: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      marginTop: 2,
    },
    rationale: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: tokens.fg1,
    },
    disclaimer: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 11,
      lineHeight: 15,
      color: tokens.fg3,
    },
    actions: {
      gap: 10,
    },
    actionsFooter: {
      paddingHorizontal: 22,
      paddingTop: 6,
      paddingBottom: 30,
    },
  })
}
