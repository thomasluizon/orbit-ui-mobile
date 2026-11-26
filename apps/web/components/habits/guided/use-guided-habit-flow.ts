'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { createUseGuidedHabitFlow, type GuidedHabitFlowForm } from '@orbit/shared/hooks/guided-habit-flow-core'
import { isHabitOrbitLimitReached, type HabitFormSuggestionPatch, type HabitPhraseFormOwnership } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useDateInterpretation } from '@/hooks/use-date-interpretation'
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

/** The web wiring of the shared guided habit flow: the form of the modal, the locale of next-intl, the profile and the free phrase reader and the Orbit date read. */
export function useGuidedHabitFlow({ formHelpers, lockedGeneral, mode, onReminderEnabledChange, onSlipAlertEnabledChange, onPhraseOwnershipChange }: Readonly<GuidedHabitFlowOptions>) {
  const { form } = formHelpers
  const { profile } = useProfile()
  const { isOnline } = useOffline()
  const { mutateAsync: readPhrase } = useHabitPhraseRead()
  const { mutateAsync: interpretDateRequest } = useDateInterpretation()
  const interpretDate = useCallback((request: { phrase: string; language: string }) => interpretDateRequest(request), [interpretDateRequest])
  const flowForm: GuidedHabitFlowForm = useMemo(() => ({
    getValues: () => form.getValues(),
    setField: (field, value) => form.setValue(field, value as never, { shouldDirty: true }),
  }), [form])
  const applySchedule = useCallback((patch: HabitFormSuggestionPatch) => applySuggestionSchedule(patch, formHelpers), [formHelpers])
  return useGuidedHabitFlowCore({
    mode, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, onPhraseOwnershipChange,
    locale: useLocale(),
    timeZone: profile?.timeZone,
    isOnline,
    helpers: formHelpers,
    form: flowForm,
    watched: { title: form.watch('title'), itemType: form.watch('itemType'), dueDate: form.watch('dueDate'), dueTime: form.watch('dueTime'), frequencyUnit: form.watch('frequencyUnit'), isFlexible: form.watch('isFlexible') },
    readPhrase,
    interpretDate,
    atOrbitLimit: isHabitOrbitLimitReached(profile?.aiMessagesUsed ?? 0, profile?.aiMessagesLimit ?? 5),
    applySchedule,
  })
}
