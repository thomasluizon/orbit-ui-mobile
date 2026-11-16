import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createUseGuidedHabitFlow, type GuidedHabitFlowForm } from '@orbit/shared/hooks/guided-habit-flow-core'
import type { HabitFormSuggestionPatch, HabitPhraseFormOwnership } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useHabitPhraseRead } from '@/hooks/use-habit-phrase-read'
import { useOffline } from '@/hooks/use-offline'
import { useProfile } from '@/hooks/use-profile'
import { applySuggestionSchedule } from '../create-habit-modal/apply-suggestion'

export type { GuidedHabitProposals } from '@orbit/shared/hooks/guided-habit-flow-core'

const useGuidedHabitFlowCore = createUseGuidedHabitFlow({ useState, useEffect, useMemo, useCallback, useRef })

interface GuidedHabitFlowOptions {
  formHelpers: HabitFormHelpers
  lockedGeneral: boolean | null
  mode: 'create' | 'edit'
  onReminderEnabledChange?: (enabled: boolean) => void
  onSlipAlertEnabledChange?: (enabled: boolean) => void
  onPhraseOwnershipChange?: (ownership: HabitPhraseFormOwnership) => void
}

/** The Android wiring of the shared guided habit flow: the form of the modal, the locale of i18next, the profile and the free phrase reader. */
export function useGuidedHabitFlow({ formHelpers, lockedGeneral, mode, onReminderEnabledChange, onSlipAlertEnabledChange, onPhraseOwnershipChange }: Readonly<GuidedHabitFlowOptions>) {
  const { form } = formHelpers
  const { i18n } = useTranslation()
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const { mutateAsync: readPhrase } = useHabitPhraseRead()
  const flowForm: GuidedHabitFlowForm = useMemo(() => ({
    getValues: () => form.getValues(),
    setField: (field, value) => form.setValue(field, value as never, { shouldDirty: true }),
  }), [form])
  const applySchedule = useCallback((patch: HabitFormSuggestionPatch) => applySuggestionSchedule(patch, formHelpers), [formHelpers])
  return useGuidedHabitFlowCore({
    mode, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, onPhraseOwnershipChange,
    locale: i18n.language,
    timeZone: profile?.timeZone,
    isOnline,
    helpers: formHelpers,
    form: flowForm,
    watched: { title: form.watch('title'), dueDate: form.watch('dueDate'), dueTime: form.watch('dueTime'), frequencyUnit: form.watch('frequencyUnit'), isFlexible: form.watch('isFlexible') },
    readPhrase,
    applySchedule,
  })
}
