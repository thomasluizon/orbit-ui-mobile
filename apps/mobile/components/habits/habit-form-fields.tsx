import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'
import { captureError } from '@/lib/sentry'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useHabitFormInteraction } from './habit-form-fields/habit-form-interaction'
import { SPACING } from '@orbit/shared/theme'
import { X } from '@/components/ui/icons'
import { backendFormFieldFocusRequest, resolveBackendFormFieldMessage } from '@orbit/shared/hooks'
import { useBackendFieldErrors } from '@/hooks/use-backend-field-errors'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, Keyframe } from 'react-native-reanimated'
import { useController, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
import { toTime24,
  buildHabitAstraFallbackCopy,
  buildHabitEmojiSuggestionAvailability,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  createHabitFormController,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  formatHabitReminderLabel,
  getFriendlyErrorMessage,
  extractBackendStatus,
  isHabitDailySchedule,
  isHabitAstraLimitReached,
  readTypedHabitPhrase,
  resolveSupportedLocale,
  shouldShowHabitAstraFallback,
} from '@orbit/shared/utils'
import { MAX_HABIT_DESCRIPTION_LENGTH, validateTagForm, validateEndTime } from '@orbit/shared/validation'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useSuggestTags, useTags, useUpdateTag } from '@/hooks/use-tags'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Input } from '@/components/ui/input'
import { HabitTypeField } from './habit-form-fields/habit-type-field'
import { HabitDateField } from './habit-form-fields/habit-date-field'
import { DateField } from '@/components/ui/date-field'
import { ListRow } from '@/components/ui/list-row'
import { Proposed } from '@/components/ui/proposed'
import { FormSectionLabel } from './habit-form-fields/form-section-label'
import { PillButton } from '@/components/ui/pill-button'
import { TimeField } from '@/components/ui/time-field'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitScheduleFields } from './habit-form-fields/habit-schedule-fields'
import { HabitUnderstanding, HabitRepeatInterval } from './habit-form-fields/habit-understanding'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { TagPickerField } from './habit-form-fields/tag-picker-field'
import { TagSuggestions } from './habit-form-fields/tag-suggestions'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { createStyles as createFormStyles } from './habit-form-fields/styles'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function HabitEndTimeField({ formHelpers, dueTime }: Readonly<{ formHelpers: HabitFormHelpers; dueTime: string }>) {
  const { disabled, guard } = useHabitFormInteraction()
  const { t } = useTranslation()
  const dueEndTime = useWatch({ control: formHelpers.form.control, name: 'dueEndTime' }) ?? ''
  const error = validateEndTime(dueTime, dueEndTime)
  if (formHelpers.isGeneral) return null
  return (
    <TimeField
      label={t('habits.form.dueEndTime')}
      value={toTime24(dueEndTime)}
      disabled={disabled || !dueTime}
      hint={dueTime ? undefined : t('habits.form.endTimeRequiresStart')}
      error={error ? t(error) : undefined}
      onChange={guard((value) => formHelpers.form.setValue('dueEndTime', value, { shouldDirty: true }))}
      onClear={guard(() => formHelpers.form.setValue('dueEndTime', '', { shouldDirty: true }))}
    />
  )
}

const DISCLOSURE_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.95 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(0.16, 1, 0.3, 1) },
}).duration(220)

const DISCLOSURE_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.95 }], easing: Easing.bezier(0.4, 0, 1, 1) },
}).duration(165)

interface HabitFormFieldsProps extends HabitFormCommonProps<HabitFormHelpers, TagSelectionState, ReactNode> {
  onFlushBufferedInputsReady?: (flush: () => void) => void
  onUpgrade: () => void
}

function renderSubHabitChildren(
  children: ReactNode | ((proposedItems: number) => ReactNode),
  proposedItems: number,
): ReactNode {
  return typeof children === 'function' ? children(proposedItems) : children
}

interface AstraFallbackProps {
  visible: boolean
  atLimit: boolean
  isSuggesting: boolean
  limitMessage: string
  readingLabel: string
  askLabel: string
  costLabel: string
  onAsk: () => void
  tokens: AppTokens
}

function AstraFallback({
  visible,
  atLimit,
  isSuggesting,
  limitMessage,
  readingLabel,
  askLabel,
  costLabel,
  onAsk,
  tokens,
}: Readonly<AstraFallbackProps>) {
  const { disabled, guard } = useHabitFormInteraction()
  if (!visible) return null
  return (
    <View style={{ gap: 12 }}>
      {atLimit ? <CapacityNotice message={limitMessage} /> : null}
      <View style={{ alignItems: 'flex-start', gap: 8 }}>
        <PillButton minimumHeight={48} borderless iconOnly label={askLabel} variant="ghost" loading={isSuggesting} hint={isSuggesting ? readingLabel : undefined} disabled={disabled || atLimit} onClick={guard(onAsk)}><AstraGlyph size={20} /></PillButton>
        {!atLimit ? <Text style={{ color: tokens.fg3, fontSize: 12 }}>{costLabel}</Text> : null}
      </View>
    </View>
  )
}

interface ReminderEditorsProps {
  dueTime: string
  reminderEnabled: boolean
  reminderTimes: number[]
  scheduledReminders: { when: ScheduledReminderWhen; time: string }[]
  tokens: AppTokens
  onReminderTimesChange: (times: number[]) => void
  onToggle: () => void
  onSetScheduledReminders: (items: { when: ScheduledReminderWhen; time: string }[]) => void
  onValidationError: (message: string) => void
  t: (key: string) => string
}

interface SubHabitSectionProps {
  proposed: boolean
  children?: ReactNode
  t: (key: string) => string
}

interface EndDateEditorProps {
  visible: boolean
  value: string
  onChange: (value: string) => void
  t: (key: string) => string
}

function EndDateEditor({ visible, value, onChange, t }: Readonly<EndDateEditorProps>) {
  const { disabled, guard } = useHabitFormInteraction()
  const [focusRequest, setFocusRequest] = useState(0)
  if (!visible) return null
  return (
    <View style={{ gap: 8 }}>
      <FormSectionLabel>{t('habits.form.endDate')}</FormSectionLabel>
      <DateField disabled={disabled} label={t('habits.form.endDate')} value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={guard(onChange)} focusRequest={focusRequest} />
      {value ? <View style={{ alignItems: 'flex-end' }}>
        <PillButton disabled={disabled} variant="ghost" iconOnly label={t('habits.form.removeEndDate')} onClick={() => {
          onChange('')
          setFocusRequest((request) => request + 1)
        }}><X size={20} /></PillButton>
      </View> : null}
    </View>
  )
}

interface SlipAlertEditorProps {
  visible: boolean
  tokens: AppTokens
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  onUpgrade: () => void
  t: (key: string) => string
}

function SlipAlertEditor({
  visible,
  tokens,
  hasProAccess,
  slipAlertEnabled,
  onToggle,
  onUpgrade,
  t,
}: Readonly<SlipAlertEditorProps>) {
  if (!visible) return null
  return (
    <View style={{ gap: 8 }}>
      <FormSectionLabel>{t('habits.form.slipAlert')}</FormSectionLabel>
      <SlipAlertSection inline tokens={tokens} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={onToggle} onUpgrade={onUpgrade} />
    </View>
  )
}

function SubHabitSection({
  proposed,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  if (!children) return null
  return (
    <View style={{ gap: 8 }}>
      <FormSectionLabel>{t('habits.form.subHabits')}</FormSectionLabel>
      <Proposed proposed={proposed} scope="field" label={t('habits.detail.proposed')}>
        {children}
      </Proposed>
    </View>
  )
}

function ReminderEditors({
  dueTime,
  reminderEnabled,
  reminderTimes,
  scheduledReminders,
  tokens,
  onReminderTimesChange,
  onToggle,
  onSetScheduledReminders,
  onValidationError,
  t,
}: Readonly<ReminderEditorsProps>) {
  const { guard } = useHabitFormInteraction()
  if (!dueTime) {
    return <ScheduledReminderSection inline tokens={tokens} reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} />
  }
  return (
    <ReminderSection inline toggleLabel={t('habits.form.reminder')} tokens={tokens} reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={guard(onReminderTimesChange)} onToggleReminder={onToggle} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} scheduledReminderCount={scheduledReminders.length} onValidationError={onValidationError}>
      <ScheduledReminderSection inline tokens={tokens} reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} offsetReminderCount={reminderTimes.length} nested />
    </ReminderSection>
  )
}

function HabitTimingFields({ formHelpers, controller, reminderTimes, onReminderTimesChange, showError, tokens }: Readonly<{ formHelpers: HabitFormHelpers; controller: ReturnType<typeof createHabitFormController>; reminderTimes: number[]; onReminderTimesChange: (times: number[]) => void; showError: (message: string) => void; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const { form } = formHelpers
  const { disabled, guard } = useHabitFormInteraction()
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const reminderEnabled = useWatch({ control: form.control, name: 'reminderEnabled' }) ?? false
  const scheduledReminders = useWatch({ control: form.control, name: 'scheduledReminders' }) ?? []
  if (formHelpers.isGeneral) return null
  return (
    <>
            <View style={{ gap: 16 }}>
              <TimeField
                disabled={disabled}
                label={t('habits.form.exactTime')}
                hint={t('habits.form.anyTimeHint')}
                value={toTime24(dueTime)}
                onChange={guard(controller.setDueTime)}
                onClear={guard(controller.clearDueTime)}
              />
              <HabitEndTimeField formHelpers={formHelpers} dueTime={dueTime} />
            </View>
            <View style={{ gap: 8 }}>
              <FormSectionLabel>{t('habits.form.reminders')}</FormSectionLabel>
              <ReminderEditors
                dueTime={dueTime}
                reminderEnabled={reminderEnabled}
                reminderTimes={reminderTimes}
                scheduledReminders={scheduledReminders}
                tokens={tokens}
                onReminderTimesChange={guard(onReminderTimesChange)}
                onToggle={() => controller.setReminderEnabled(!reminderEnabled)}
                onSetScheduledReminders={(items) => form.setValue('scheduledReminders', items, { shouldDirty: true })}
                onValidationError={showError}
                t={t}
              />
            </View>
    </>
  )
}

function HabitAvoidanceFields({ formHelpers, controller, hasProAccess, tokens, onUpgrade }: Readonly<{ formHelpers: HabitFormHelpers; controller: ReturnType<typeof createHabitFormController>; hasProAccess: boolean; tokens: ReturnType<typeof createTokensV2>; onUpgrade: () => void }>) {
  const { t } = useTranslation()
  const { form } = formHelpers
  const { disabled, guard } = useHabitFormInteraction()
  const isBadHabit = useWatch({ control: form.control, name: 'isBadHabit' }) ?? false
  const slipAlertEnabled = useWatch({ control: form.control, name: 'slipAlertEnabled' }) ?? false
  if (formHelpers.isGeneral) return null
  return (
    <>
            {/* eslint-disable-next-line local/max-button-words -- Orbit Habit Create draws the avoid-habit switch label. */}
            <ListRow disabled={disabled} placement="column" title={t('habits.form.habitTypeAvoid')} description={t('habits.form.habitTypeAvoidHint')} toggle={{ checked: isBadHabit, onChange: guard((checked) => form.setValue('isBadHabit', checked, { shouldDirty: true })) }} />

            <SlipAlertEditor visible={isBadHabit} tokens={tokens} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} onUpgrade={onUpgrade} t={t} />
    </>
  )
}

export function HabitFormFields({
  formHelpers,
  habitId,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  onGoalCreated,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  onPhraseOwnershipChange,
  onFlushBufferedInputsReady,
  onResolveSubHabitProposalReady,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  onSuggestEmoji,
  isEmojiSuggesting = false,
  emojiSuggestionError,
  emojiSuggestionLimitReached = false,
  isSuggesting = false,
  readPhraseLocally = false,
  lockedGeneral = null,
  onUpgrade,
  defaultExpanded = false,
  parentField,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const { disabled, guard, isDisabled } = useHabitFormInteraction()
  const { t, i18n } = useTranslation()
  const allowanceText = useAstraAllowanceCopy()
  const locale = resolveSupportedLocale(i18n.language)
  const translate = useCallback((key: string, values?: Record<string, unknown>) => t(key, values), [t])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { profile } = useProfile()
  const { form, daysList, showEndDate, toggleDay, setOneTime, setRecurring, setFlexible, setGeneral } = formHelpers
  const { setValue, formState: { errors } } = form
  const itemType = useWatch({ control: form.control, name: 'itemType' })

  const { field: titleField } = useController({ control: form.control, name: 'title' })
  const title = coalesceFormText(useWatch({ control: form.control, name: 'title' }))
  const emoji = useWatch({ control: form.control, name: 'emoji' }) ?? ''
  const watchedDays = useWatch({ control: form.control, name: 'days' })
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const watchedQuantity = useWatch({ control: form.control, name: 'frequencyQuantity' })
  const intervalWeeks = useWatch({ control: form.control, name: 'intervalWeeks' }) ?? 1
  const frequencyUnit = useWatch({ control: form.control, name: 'frequencyUnit' })
  const frequencyQuantity = watchedQuantity ?? (frequencyUnit ? 0 : 3)
  const isFlexible = useWatch({ control: form.control, name: 'isFlexible' }) ?? false
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const endDate = useWatch({ control: form.control, name: 'endDate' }) ?? ''
  const description = useWatch({ control: form.control, name: 'description' }) ?? ''
  const checklistItems = useWatch({ control: form.control, name: 'checklistItems' }) ?? []
  const [detailsOpen, setDetailsOpen] = useState(defaultExpanded)
  const [proposal, setProposal] = useState(EMPTY_HABIT_FORM_PROPOSAL)
  const rendersGranularSubHabits = typeof children === 'function'
  const subHabitChildren = renderSubHabitChildren(children, proposal.subHabitItems)
  const [phraseOwnership, setPhraseOwnership] = useState({ cadence: false, dueTime: false })
  const lastLocallyReadPhraseRef = useRef<{ title: string; itemType: typeof itemType; general: boolean } | null>(null)
  const newTagErrors = useBackendFieldErrors({ name: tags.newTagName }, { name: 'Name' })
  const editTagErrors = useBackendFieldErrors({ name: tags.editTagName }, { name: 'Name' })
  const descriptionFailure = formHelpers.backendFieldErrors.description

  const [previousExpandSignal, setPreviousExpandSignal] = useState(expandAdvancedSignal)
  if (expandAdvancedSignal !== previousExpandSignal) {
    setPreviousExpandSignal(expandAdvancedSignal)
    if (expandAdvancedSignal > 0) setDetailsOpen(true)
  }

  const { tags: availableTags = [] } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const tagMutationPending = createTag.isPending || updateTag.isPending || deleteTag.isPending
  const suggestTags = useSuggestTags()
  const tagSuggestions = useTagSuggestions({
    availableTags,
    title, description, language: i18n.language, disabled: disabled || tagMutationPending || tags.atTagLimit,
    request: suggestTags.mutateAsync,
    accept: (suggestion) => tags.acceptSuggestedTag(suggestion, async (name, color) => (await createTag.mutateAsync({ name, color })).id),
  })
  const localRead = useMemo(
    () => readTypedHabitPhrase(title, locale, itemType, formHelpers.isGeneral),
    [formHelpers.isGeneral, itemType, locale, title],
  )

  useEffect(() => {
    if (!onFlushBufferedInputsReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- direct form writes make flushing unnecessary; this preserves the modal's imperative submit contract https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onFlushBufferedInputsReady(() => {})
    return () => onFlushBufferedInputsReady(() => {})
  }, [onFlushBufferedInputsReady])

  useEffect(() => {
    if (!dueTime && form.getValues('dueEndTime')) setValue('dueEndTime', '', { shouldDirty: true })
  }, [dueTime, form, setValue])

  const sentence = useMemo(
    () => buildHabitUnderstandingSentence(days, daysList, isFlexible, frequencyUnit, frequencyQuantity, dueTime, locale, translate, intervalWeeks),
    [days, daysList, dueTime, frequencyQuantity, frequencyUnit, intervalWeeks, isFlexible, locale, translate],
  )
  const daily = isHabitDailySchedule(days, isFlexible, frequencyUnit, frequencyQuantity)
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, allowance)
  const astraFallbackCopy = useMemo(
    () => buildHabitAstraFallbackCopy(allowanceText, allowance),
    [allowance, allowanceText],
  )
  const understandingLabels = useMemo(() => buildHabitUnderstandingLabels(translate), [translate])

  const emojiAvailability = buildHabitEmojiSuggestionAvailability(title, atMessageLimit || emojiSuggestionLimitReached, {
    titleRequired: t('habits.form.titleRequired'),
    limitReached: astraFallbackCopy.limitMessage,
  })

  const controller = useMemo(
    () => createHabitFormController({
      onSlipAlertEnabledChange: onSlipAlertEnabledChange ? guard(onSlipAlertEnabledChange) : undefined,
      onReminderEnabledChange: onReminderEnabledChange ? guard(onReminderEnabledChange) : undefined,
      onSuggestionContextChange,
      lockedGeneral,
      atLimit: atMessageLimit,
      action: onSuggestSetup,
      target: {
        hasSchedule: () => isFlexible || Boolean(frequencyUnit),
        setOneTime: guard(() => { if (form.getValues('itemType') !== 'habit') setOneTime() }),
        setRecurring: guard(setRecurring),
        setFlexible: guard(setFlexible),
        setGeneral: guard(setGeneral),
        toggleDay: guard(toggleDay),
        getOwnership() { return phraseOwnership },
        setOwnership(ownership) {
          if (isDisabled()) return
          setPhraseOwnership(ownership)
          onPhraseOwnershipChange?.(ownership)
        },
        updateProposal(update) { if (!isDisabled()) setProposal(update) },
        setField(field, value, validate = false) {
          if (isDisabled()) return
          const options = validate ? { shouldDirty: true, shouldValidate: true } : { shouldDirty: true }
          setValue(field, value as never, options)
        },
      },
    }),
    [atMessageLimit, guard, isDisabled, form, frequencyUnit, isFlexible, lockedGeneral, onPhraseOwnershipChange, onReminderEnabledChange, onSlipAlertEnabledChange, onSuggestSetup, onSuggestionContextChange, phraseOwnership, setFlexible, setGeneral, setOneTime, setRecurring, setValue, toggleDay],
  )

  useEffect(() => {
    const previous = lastLocallyReadPhraseRef.current
    lastLocallyReadPhraseRef.current = { title, itemType, general: formHelpers.isGeneral }
    if (previous?.title === title) {
      if (readPhraseLocally && (previous.itemType !== itemType || previous.general !== formHelpers.isGeneral)) controller.reconcilePhraseOwnership(localRead)
      return
    }
    if (!previous && formHelpers.retiredCadenceTitle === title) return
    controller.readPhrase(readPhraseLocally, localRead, emoji)
  }, [controller, emoji, formHelpers.isGeneral, formHelpers.retiredCadenceTitle, itemType, localRead, readPhraseLocally, title])

  useEffect(() => {
    if (!onResolveSubHabitProposalReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- the modal owns this editor; registering its resolver preserves section-specific proposal state https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onResolveSubHabitProposalReady(controller.resolveSubHabitProposal)
    return () => onResolveSubHabitProposalReady(() => {})
  }, [controller, onResolveSubHabitProposalReady])

  async function createNewTag() {
    if (isDisabled()) return
    const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
    if (validationError) {
      showError(translate(validationError))
      return
    }
    try {
      await tags.createAndSelectTag(async (name, color) => (await createTag.mutateAsync({ name, color })).id)
    } catch (error: unknown) {
      if (!newTagErrors.reportBackendErrors(error).handled) showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
    }
  }

  async function deleteExistingTag(id: string) {
    try {
      await tags.deleteTag(id, async (tagId) => { await deleteTag.mutateAsync(tagId) })
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, translate, 'toast.errors.unknown', 'tag'))
      if (extractBackendStatus(error) !== 409) captureError(error)
    }
  }

  async function saveEditedTag() {
    if (isDisabled()) return
    try {
      await tags.saveEditTag(async (id, name, color) => { await updateTag.mutateAsync({ tagId: id, name, color }) })
    } catch (error: unknown) {
      if (!editTagErrors.reportBackendErrors(error).handled) showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
    }
  }

  return (
    <View style={styles.container} accessibilityState={{ busy: disabled }}>
      <HabitTypeField formHelpers={formHelpers} lockedGeneral={lockedGeneral} onChange={() => { onSuggestionContextChange?.(); controller.clearProposal() }} />
      <HabitUnderstanding
        showSchedule={itemType !== 'task' && !formHelpers.isGeneral}
        inputRef={titleField.ref}
        labels={understandingLabels}
        onQuantityChange={controller.setQuantity}
        onToggleDay={(day) => controller.toggleDay(day, daily, days)}
        onEmojiSelect={controller.setEmoji}
        onSuggestEmoji={onSuggestEmoji}
        canSuggestEmoji={emojiAvailability.canSuggest}
        isEmojiSuggesting={isEmojiSuggesting}
        emojiSuggestionHint={emojiAvailability.hint}
        emojiSuggestionError={emojiSuggestionError}
        isSuggestionDisabled={isSuggesting && !isEmojiSuggesting}
        onValueChange={controller.setTitle}
        proposed={proposal.setup}
        scheduleLocked={lockedGeneral === true}
        consumed={localRead.consumed}
        sentence={sentence}
        quantity={frequencyQuantity}
        mode={isFlexible ? 'flexible' : 'fixed'}
        showCountCorrection={!frequencyUnit || frequencyUnit === 'Week'}
        dayOptions={daysList}
        days={days}
        daily={daily}
        emoji={emoji}
        error={resolveBackendFormFieldMessage(formHelpers.backendFieldErrors.title, errors.title?.message, t)}
        value={title}
      >
        <Input disabled={disabled} label={t('habits.form.description')} error={descriptionFailure} focusRequest={backendFormFieldFocusRequest('description', formHelpers.backendFocusField, formHelpers.backendFocusRequest)} value={description} onChange={guard((value) => setValue('description', value, { shouldDirty: true }))} multiline rows={3} maxLength={MAX_HABIT_DESCRIPTION_LENGTH} />
      </HabitUnderstanding>

      <AstraFallback
        tokens={tokens}
        onAsk={() => void controller.askAstra()}
        {...astraFallbackCopy}
        isSuggesting={isSuggesting}
        atLimit={atMessageLimit}
        visible={itemType !== 'task' && !formHelpers.isGeneral && shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
      />

      <HabitDateField generalLocked={lockedGeneral === true} formHelpers={formHelpers} onRecurrence={controller.setRecurrence} />

      <View style={styles.disclosure}>
        <ListRow disabled={disabled} icon={detailsOpen ? 'chevron-down' : 'chevron-right'} title={t('habits.form.moreDetails')} expanded={detailsOpen} placement="column" chevron={false} onClick={() => setDetailsOpen((open) => !open)} />
        {detailsOpen ? (
          <Animated.View entering={DISCLOSURE_ENTER} exiting={DISCLOSURE_EXIT} style={styles.details}>
            <HabitScheduleFields
              hidden={itemType === 'task'}
              general={formHelpers.isGeneral}
              generalLocked={lockedGeneral === false}
              onGeneral={guard(() => { onSuggestionContextChange?.(); controller.clearProposal(); setGeneral() })}
              proposed={proposal.setup}
              unit={frequencyUnit ?? null}
              quantity={watchedQuantity ?? null}
              flexible={isFlexible}
              disabled={disabled || lockedGeneral === true}
              onModeChange={controller.setScheduleMode}
              onChange={controller.setSchedule}
            />
            <HabitRepeatInterval visible={isFlexible || Boolean(frequencyUnit)} intervalWeeks={intervalWeeks} scheduleLocked={lockedGeneral === true} onIntervalWeeksChange={controller.setIntervalWeeks} labels={understandingLabels} />
            <HabitTimingFields formHelpers={formHelpers} controller={controller} reminderTimes={reminderTimes} onReminderTimesChange={guard(onReminderTimesChange)} showError={showError} tokens={tokens} />
            <View style={{ gap: 8 }}>
              <FormSectionLabel>{t('habits.form.checklist')}</FormSectionLabel>
              <HabitChecklist items={checklistItems} editable proposedItemCount={proposal.checklistItems} onItemsChange={controller.setChecklistItems} />
              <ChecklistTemplates items={checklistItems} onLoad={controller.setChecklistItems} />
            </View>
            <SubHabitSection proposed={proposal.subHabits && !rendersGranularSubHabits} t={t}>
              {subHabitChildren}
            </SubHabitSection>
            <HabitAvoidanceFields formHelpers={formHelpers} controller={controller} hasProAccess={hasProAccess} tokens={tokens} onUpgrade={onUpgrade} />
            {parentField}
            <View><TagPickerField suggestions={<TagSuggestions suggestions={tagSuggestions} atLimit={tags.atTagLimit} disabled={disabled || tagMutationPending} />} tags={availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={disabled || tagMutationPending} onToggle={guard(tags.toggleTag)} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void deleteExistingTag(id)} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={tags.showNewTag ? <TagEditorRow error={newTagErrors.fieldErrors.name} focusRequest={newTagErrors.focusRequest} value={tags.newTagName} placeholder={t('habits.form.tagName')} disabled={disabled || createTag.isPending} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t('common.add')} onChange={guard(tags.setNewTagName)} onCommit={() => void createNewTag()} onCancel={() => { newTagErrors.clearBackendErrors(); tags.setShowNewTag(false) }} styles={formStyles} tokens={tokens} /> : tags.editingTagId ? <TagEditorRow error={editTagErrors.fieldErrors.name} focusRequest={editTagErrors.focusRequest} value={tags.editTagName} disabled={disabled || updateTag.isPending} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t('common.save')} onChange={guard(tags.setEditTagName)} onCommit={() => void saveEditedTag()} onCancel={() => { editTagErrors.clearBackendErrors(); tags.cancelEditTag() }} styles={formStyles} tokens={tokens} /> : undefined} />{tags.atTagLimit ? <Text style={styles.hint}>{t('habits.form.tagLimit')}</Text> : null}</View>
            <View><GoalLinkingField habitId={habitId} onGoalCreated={guard(onGoalCreated ?? onToggleGoal)} selectedGoalIds={selectedGoalIds} atGoalLimit={atGoalLimit} onToggleGoal={guard(onToggleGoal)} /></View>
            <EndDateEditor visible={showEndDate} value={endDate} onChange={guard((value) => setValue('endDate', value, { shouldDirty: true }))} t={t} />
          </Animated.View>
        ) : null}
      </View>


    </View>
  )
}

type AppTokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: { gap: 24 }, disclosure: { gap: 12 }, details: { gap: 24, paddingHorizontal: SPACING.s16 },
    compactGroup: { gap: 8 },
    meta: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12 },
    hint: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  })
}
