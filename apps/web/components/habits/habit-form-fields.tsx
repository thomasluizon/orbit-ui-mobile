'use client'

import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'

import { OrbitMascot } from '@/components/ui/orbit-mascot'

import { backendFormFieldFocusRequest, resolveBackendFormFieldMessage } from '@orbit/shared/hooks'

import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useController } from 'react-hook-form'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import {
  buildHabitAstraFallbackCopy,
  buildHabitEmojiSuggestionAvailability,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  createHabitFormController,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  isHabitDailySchedule,
  isHabitAstraLimitReached,
  parseAPIDate,
  readTypedHabitPhrase,
  resolveSupportedLocale,
  shouldShowHabitAstraFallback,
} from '@orbit/shared/utils'
import { hasHabitMonthDaySchedule } from '@orbit/shared/validation'
import { useAppToast } from '@/hooks/use-app-toast'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { HabitTimingField } from './habit-form-fields/habit-timing-field'
import { HabitTypeField } from './habit-form-fields/habit-type-field'
import { HabitDateField } from './habit-form-fields/habit-date-field'
import { Input } from '@/components/ui/input'
import { ListRow } from '@/components/ui/list-row'
import { FormSectionLabel } from './habit-form-fields/form-section-label'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitScheduleFields } from './habit-form-fields/habit-schedule-fields'
import { HabitMonthDaysField } from './habit-form-fields/habit-month-days-field'
import { HabitUnderstanding, HabitRepeatInterval } from './habit-form-fields/habit-understanding'
import { HabitTagsField } from './habit-form-fields/habit-tags-field'
import { EndDateEditor } from './habit-form-fields/end-date-editor'
import { HabitAvoidanceFields } from './habit-form-fields/habit-avoidance-fields'
import { useExpandAdvancedSignal } from './habit-form-fields/use-expand-advanced-signal'


interface HabitFormFieldsProps extends HabitFormCommonProps<HabitFormHelpers, TagSelectionState, ReactNode> {
  titleInputRef?: RefObject<HTMLInputElement | null>
  disabled?: boolean
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
}: Readonly<AstraFallbackProps>) {
  if (!visible) return null
  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      {atLimit ? <CapacityNotice message={limitMessage} /> : null}
      <div className="flex flex-col items-start" style={{ gap: 8 }}>
        <PillButton minimumHeight={48} borderless iconOnly label={askLabel} variant="ghost" loading={isSuggesting} hint={isSuggesting ? readingLabel : undefined} disabled={atLimit} onClick={onAsk}><OrbitMascot size={20} /></PillButton>
        {!atLimit ? <p className="text-xs text-[var(--fg-3)]">{costLabel}</p> : null}
      </div>
    </div>
  )
}

interface SubHabitSectionProps {
  proposed: boolean
  task: boolean
  children?: ReactNode
  t: ReturnType<typeof useTranslations>
}

function SubHabitSection({
  proposed,
  task,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  if (!children) return null
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{task ? t('habits.form.subTasksQuestion') : t('habits.form.subHabitsQuestion')}</FormSectionLabel>
      <Proposed proposed={proposed} scope="field" label={t('habits.detail.proposed')}>
        {children}
      </Proposed>
    </section>
  )
}

export function HabitFormFields({
  formHelpers,
  disabled = false,
  habitId,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  onGoalCreated,
  reminderTimes,
  onReminderTimesChange,
  onPendingChecklistItemChange,
  pendingChecklistItem,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  onPhraseOwnershipChange,
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
  defaultExpanded = false,
  parentField,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const t = useTranslations()
  const allowanceText = useAstraAllowanceCopy()
  const language = useLocale()
  const locale = resolveSupportedLocale(language)
  const translate = useCallback(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    [t],
  )
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { profile } = useProfile()
  const { form, daysList, showEndDate, toggleDay, setOneTime, setRecurring, setFlexible, setGeneral } = formHelpers
  const { watch, setValue, formState: { errors } } = form
  const itemType = watch('itemType')
  const { field: titleField } = useController({ control: form.control, name: 'title' })
  const title = coalesceFormText(watch('title'))
  const emoji = watch('emoji') ?? ''
  const watchedDays = watch('days')
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const intervalWeeks = watch('intervalWeeks') ?? 1
  const watchedMonthDays = watch('monthDays')
  const monthDays = useMemo(() => watchedMonthDays ?? [], [watchedMonthDays])
  const startDate = watch('dueDate') ?? ''
  const frequencyUnit = watch('frequencyUnit')
  const frequencyQuantity = watch('frequencyQuantity') ?? (frequencyUnit ? 0 : 3)
  const isFlexible = watch('isFlexible') ?? false
  const dueTime = watch('dueTime') ?? ''
  const endDate = watch('endDate') ?? ''
  const description = watch('description') ?? ''
  const checklistItems = watch('checklistItems') ?? []
  const detailsId = useId()
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(defaultExpanded)
  const [detailsPresented, setDetailsPresented] = useAccountScopedState(defaultExpanded)
  const descriptionFailure = formHelpers.backendFieldErrors.description
  const [proposal, setProposal] = useAccountScopedState(EMPTY_HABIT_FORM_PROPOSAL)
  const rendersGranularSubHabits = typeof children === 'function'
  const subHabitChildren = renderSubHabitChildren(children, proposal.subHabitItems)
  const [phraseOwnership, setPhraseOwnership] = useAccountScopedState({ cadence: false, dueTime: false })
  const lastLocallyReadPhraseRef = useRef<{ title: string; itemType: typeof itemType; general: boolean } | null>(null)
  useResetOnAccountChange(() => {
    lastLocallyReadPhraseRef.current = null
  })
  useExpandAdvancedSignal(expandAdvancedSignal, () => {
    setDetailsPresented(true)
    setDetailsOpen(true)
  })

  const localRead = useMemo(() => readTypedHabitPhrase(title, locale, itemType, formHelpers.isGeneral), [formHelpers.isGeneral, itemType, locale, title])

  useEffect(() => {
    if (!dueTime && form.getValues('dueEndTime')) {
      setValue('dueEndTime', '', { shouldDirty: true })
    }
  }, [dueTime, form, setValue])

  const sentence = useMemo(
    () => buildHabitUnderstandingSentence(days, daysList, isFlexible, frequencyUnit, frequencyQuantity, dueTime, locale, translate, intervalWeeks,
      hasHabitMonthDaySchedule({ frequencyUnit, isFlexible, isGeneral: formHelpers.isGeneral }) ? monthDays : []),
    [days, daysList, dueTime, formHelpers.isGeneral, frequencyQuantity, frequencyUnit, intervalWeeks, isFlexible, locale, monthDays, translate],
  )
  const daily = isHabitDailySchedule(days, isFlexible, frequencyUnit, frequencyQuantity)
  const monthDayAnchor = (startDate ? parseAPIDate(startDate) : new Date()).getDate()
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, allowance)
  const understandingLabels = useMemo(() => buildHabitUnderstandingLabels(translate, itemType), [translate, itemType])
  const astraFallbackCopy = useMemo(
    () => buildHabitAstraFallbackCopy(allowanceText, allowance),
    [allowance, allowanceText],
  )

  const emojiAvailability = buildHabitEmojiSuggestionAvailability(title, atMessageLimit || emojiSuggestionLimitReached, {
    titleRequired: t('habits.form.titleRequired'),
    limitReached: astraFallbackCopy.limitMessage,
  })

  const controller = useMemo(() => createHabitFormController({
    action: onSuggestSetup,
    atLimit: atMessageLimit,
    lockedGeneral,
    onReminderEnabledChange,
    onSlipAlertEnabledChange,
    onSuggestionContextChange,
    target: {
      hasSchedule: () => isFlexible || Boolean(frequencyUnit),
      getOwnership: () => phraseOwnership,
      setOwnership: (ownership) => {
        setPhraseOwnership(ownership)
        onPhraseOwnershipChange?.(ownership)
      },
      updateProposal: (update) => setProposal(update),
      setOneTime: () => { if (form.getValues('itemType') !== 'habit') setOneTime() },
      setRecurring,
      setFlexible,
      setGeneral,
      setField: (field, value, validate = false) => setValue(
        field,
        value as never,
        validate ? { shouldDirty: true, shouldValidate: true } : { shouldDirty: true },
      ),
      toggleDay,
    },
  }), [atMessageLimit, form, frequencyUnit, isFlexible, lockedGeneral, onPhraseOwnershipChange, onReminderEnabledChange, onSlipAlertEnabledChange, onSuggestionContextChange, onSuggestSetup, phraseOwnership, setFlexible, setGeneral, setOneTime, setPhraseOwnership, setProposal, setRecurring, setValue, toggleDay])

  useEffect(() => {
    const previous = lastLocallyReadPhraseRef.current
    lastLocallyReadPhraseRef.current = { title, itemType, general: formHelpers.isGeneral }
    if (previous?.title === title) {
      if (readPhraseLocally && (previous.itemType !== itemType || previous.general !== formHelpers.isGeneral)) controller.reconcilePhraseOwnership(localRead)
      return
    }
    if (!previous && formHelpers.retiredCadenceTitle === title) return
    controller.readPhrase(readPhraseLocally, localRead)
  }, [controller, formHelpers.isGeneral, formHelpers.retiredCadenceTitle, itemType, localRead, readPhraseLocally, title])

  useEffect(() => {
    if (!onResolveSubHabitProposalReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- the modal owns this editor; registering its resolver preserves section-specific proposal state https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onResolveSubHabitProposalReady(controller.resolveSubHabitProposal)
    return () => onResolveSubHabitProposalReady(() => {})
  }, [controller, onResolveSubHabitProposalReady])

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <HabitTypeField formHelpers={formHelpers} lockedGeneral={lockedGeneral} onChange={() => { onSuggestionContextChange?.(); controller.clearProposal() }} />
      <HabitUnderstanding
        showSchedule={itemType !== 'task' && !formHelpers.isGeneral}
        inputRef={titleField.ref}
        value={title}
        error={resolveBackendFormFieldMessage(formHelpers.backendFieldErrors.title, errors.title?.message, t)}
        emoji={emoji}
        days={days}
        daily={daily}
        dayOptions={daysList}
        quantity={frequencyQuantity}
        mode={isFlexible ? 'flexible' : 'fixed'}
        showCountCorrection={!frequencyUnit || frequencyUnit === 'Week'}
        sentence={sentence}
        consumed={localRead.consumed}
        proposed={proposal.setup}
        scheduleLocked={lockedGeneral === true}
        onValueChange={(value) => {
          controller.setTitle(value)
        }}
        onEmojiSelect={controller.setEmoji}
        onSuggestEmoji={onSuggestEmoji}
        canSuggestEmoji={emojiAvailability.canSuggest}
        isEmojiSuggesting={isEmojiSuggesting}
        emojiSuggestionHint={emojiAvailability.hint}
        emojiSuggestionError={emojiSuggestionError}
        isSuggestionDisabled={isSuggesting && !isEmojiSuggesting}
        onToggleDay={(day) => controller.toggleDay(day, daily, days)}
        onQuantityChange={controller.setQuantity}
        labels={understandingLabels}
      >
        <Input
          label={t('habits.form.descriptionQuestion')}
          error={descriptionFailure}
          focusRequest={backendFormFieldFocusRequest('description', formHelpers.backendFocusField, formHelpers.backendFocusRequest)}
          value={description}
          onChange={(value) => setValue('description', value, { shouldDirty: true })}
          multiline
          rows={1}
          maxLength={10000}
        />
      <HabitDateField onChange={() => { onSuggestionContextChange?.(); controller.clearProposal() }} lockedGeneral={lockedGeneral} formHelpers={formHelpers} onRecurrence={controller.setRecurrence} />

            <HabitScheduleFields
              hidden={itemType === 'task'}
              proposed={proposal.setup}
              unit={frequencyUnit ?? null}
              quantity={watch('frequencyQuantity') ?? null}
              flexible={isFlexible}
              disabled={lockedGeneral === true}
              onModeChange={controller.setScheduleMode}
              onChange={controller.setSchedule}
            />
            <HabitMonthDaysField
              visible={itemType !== 'task' && hasHabitMonthDaySchedule({ frequencyUnit, isFlexible, isGeneral: formHelpers.isGeneral })}
              monthDays={monthDays}
              anchorDay={monthDayAnchor}
              quantity={frequencyQuantity}
              proposed={proposal.setup}
              disabled={lockedGeneral === true}
              onToggle={(day) => controller.toggleMonthDay(day, monthDayAnchor, monthDays)}
            />
      </HabitUnderstanding>
      <HabitRepeatInterval visible={isFlexible || Boolean(frequencyUnit)} intervalWeeks={intervalWeeks} scheduleLocked={lockedGeneral === true} onIntervalWeeksChange={controller.setIntervalWeeks} labels={understandingLabels} />

      <AstraFallback
        visible={itemType !== 'task' && !formHelpers.isGeneral && shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
        atLimit={atMessageLimit}
        isSuggesting={isSuggesting}
        {...astraFallbackCopy}
        onAsk={() => void controller.askAstra()}
      />


            <HabitTimingField disabled={disabled} formHelpers={formHelpers} controller={controller} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} showError={showError} />

      <div className="flex flex-col" style={{ gap: 12 }}>
        <ListRow
          icon={detailsOpen ? 'chevron-down' : 'chevron-right'}
          title={t('habits.form.moreDetails')}
          expanded={detailsOpen}
          controls={detailsPresented ? detailsId : undefined}
          placement="column"
          chevron={false}
          onClick={() => {
            if (detailsOpen) {
              setDetailsOpen(false)
            } else {
              setDetailsPresented(true)
              setDetailsOpen(true)
            }
          }}
        />

        {detailsPresented ? (
          <div
            id={detailsId}
            className="habit-form-disclosure flex flex-col px-4"
            data-open={detailsOpen}
            inert={!detailsOpen ? true : undefined}
            style={{ gap: 24 }}
            onTransitionEnd={(event) => {
              if (!detailsOpen && event.propertyName === 'opacity') setDetailsPresented(false)
            }}
          >
            <section className="flex flex-col gap-4">
              <FormSectionLabel>{t('habits.form.steps')}</FormSectionLabel>
            <section className="flex flex-col gap-2">
              <FormSectionLabel>{t('habits.form.checklistQuestion')}</FormSectionLabel>
              <HabitChecklist
                pendingItemText={pendingChecklistItem} onPendingItemChange={onPendingChecklistItemChange}
                items={checklistItems}
                editable
                proposedItemCount={proposal.checklistItems}
                onItemsChange={controller.setChecklistItems}
              />
              <ChecklistTemplates
                items={checklistItems}
                onLoad={controller.setChecklistItems}
              />
            </section>

            <SubHabitSection task={itemType === 'task'} proposed={proposal.subHabits && !rendersGranularSubHabits} t={t}>
              {subHabitChildren}
            </SubHabitSection>

            </section>
            <HabitAvoidanceFields formHelpers={formHelpers} controller={controller} hasProAccess={hasProAccess} />
            <section className="flex flex-col gap-4">
              <FormSectionLabel>{t('habits.form.organize')}</FormSectionLabel>
            {parentField}
            <HabitTagsField tags={tags} title={title} description={description} />

            <section>
              <GoalLinkingField
                habitId={habitId}
                onGoalCreated={onGoalCreated ?? onToggleGoal}
                selectedGoalIds={selectedGoalIds}
                atGoalLimit={atGoalLimit}
                onToggleGoal={onToggleGoal}
              />
            </section>

            </section>
            <EndDateEditor visible={showEndDate} disabled={disabled} value={endDate} onChange={(value) => { if (!disabled) setValue('endDate', value, { shouldDirty: true }) }} t={t} />
          </div>
        ) : null}
      </div>


    </div>
  )
}
