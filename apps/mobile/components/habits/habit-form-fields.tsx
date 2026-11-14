import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useHabitFormInteraction } from './habit-form-fields/habit-form-interaction'
import { motionDurations, motionEasings, SPACING } from '@orbit/shared/theme'
import { backendFormFieldFocusRequest, resolveBackendFormFieldMessage } from '@orbit/shared/hooks'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, Keyframe, ReduceMotion } from 'react-native-reanimated'
import { useController, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
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
import { hasHabitMonthDaySchedule, MAX_HABIT_DESCRIPTION_LENGTH } from '@orbit/shared/validation'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Input } from '@/components/ui/input'
import { HabitTimingField } from './habit-form-fields/habit-timing-field'
import { HabitTypeField } from './habit-form-fields/habit-type-field'
import { HabitDateField } from './habit-form-fields/habit-date-field'
import { ListRow } from '@/components/ui/list-row'
import { Proposed } from '@/components/ui/proposed'
import { FormSectionLabel } from './habit-form-fields/form-section-label'
import { PillButton } from '@/components/ui/pill-button'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitScheduleFields } from './habit-form-fields/habit-schedule-fields'
import { HabitMonthDaysField } from './habit-form-fields/habit-month-days-field'
import { HabitUnderstanding, HabitRepeatInterval } from './habit-form-fields/habit-understanding'
import { HabitTagsField } from './habit-form-fields/habit-tags-field'
import { EndDateEditor } from './habit-form-fields/end-date-editor'
import { HabitAvoidanceFields } from './habit-form-fields/habit-avoidance-fields'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'


const DISCLOSURE_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.95 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(...motionEasings.enter) },
}).duration(motionDurations.base).reduceMotion(ReduceMotion.System)

const DISCLOSURE_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.95 }], easing: Easing.bezier(...motionEasings.exit) },
}).duration(motionDurations.routeExit).reduceMotion(ReduceMotion.System)

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
        <PillButton minimumHeight={48} borderless iconOnly label={askLabel} variant="ghost" loading={isSuggesting} hint={isSuggesting ? readingLabel : undefined} disabled={disabled || atLimit} onClick={guard(onAsk)}><OrbitMascot size={20} /></PillButton>
        {!atLimit ? <Text style={{ color: tokens.fg3, fontSize: 12 }}>{costLabel}</Text> : null}
      </View>
    </View>
  )
}

interface SubHabitSectionProps {
  proposed: boolean
  task: boolean
  children?: ReactNode
  t: (key: string) => string
}

function SubHabitSection({
  proposed,
  task,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  if (!children) return null
  return (
    <View style={{ gap: 8 }}>
      <FormSectionLabel>{task ? t('habits.form.subTasksQuestion') : t('habits.form.subHabitsQuestion')}</FormSectionLabel>
      <Proposed proposed={proposed} scope="field" label={t('habits.detail.proposed')}>
        {children}
      </Proposed>
    </View>
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
  onPendingChecklistItemChange,
  pendingChecklistItem,
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
  const watchedMonthDays = useWatch({ control: form.control, name: 'monthDays' })
  const monthDays = useMemo(() => watchedMonthDays ?? [], [watchedMonthDays])
  const startDate = useWatch({ control: form.control, name: 'dueDate' }) ?? ''
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
  const descriptionFailure = formHelpers.backendFieldErrors.description

  const [previousExpandSignal, setPreviousExpandSignal] = useState(expandAdvancedSignal)
  if (expandAdvancedSignal !== previousExpandSignal) {
    setPreviousExpandSignal(expandAdvancedSignal)
    if (expandAdvancedSignal > 0) setDetailsOpen(true)
  }

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
    () => buildHabitUnderstandingSentence(days, daysList, isFlexible, frequencyUnit, frequencyQuantity, dueTime, locale, translate, intervalWeeks,
      hasHabitMonthDaySchedule({ frequencyUnit, isFlexible, isGeneral: formHelpers.isGeneral }) ? monthDays : []),
    [days, daysList, dueTime, formHelpers.isGeneral, frequencyQuantity, frequencyUnit, intervalWeeks, isFlexible, locale, monthDays, translate],
  )
  const daily = isHabitDailySchedule(days, isFlexible, frequencyUnit, frequencyQuantity)
  const monthDayAnchor = (startDate ? parseAPIDate(startDate) : new Date()).getDate()
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, allowance)
  const astraFallbackCopy = useMemo(
    () => buildHabitAstraFallbackCopy(allowanceText, allowance),
    [allowance, allowanceText],
  )
  const understandingLabels = useMemo(() => buildHabitUnderstandingLabels(translate, itemType), [translate, itemType])

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
    controller.readPhrase(readPhraseLocally, localRead)
  }, [controller, formHelpers.isGeneral, formHelpers.retiredCadenceTitle, itemType, localRead, readPhraseLocally, title])

  useEffect(() => {
    if (!onResolveSubHabitProposalReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- the modal owns this editor; registering its resolver preserves section-specific proposal state https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onResolveSubHabitProposalReady(controller.resolveSubHabitProposal)
    return () => onResolveSubHabitProposalReady(() => {})
  }, [controller, onResolveSubHabitProposalReady])

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
        <Input disabled={disabled} label={t('habits.form.descriptionQuestion')} error={descriptionFailure} focusRequest={backendFormFieldFocusRequest('description', formHelpers.backendFocusField, formHelpers.backendFocusRequest)} value={description} onChange={guard((value) => setValue('description', value, { shouldDirty: true }))} multiline rows={1} maxLength={MAX_HABIT_DESCRIPTION_LENGTH} />
      <HabitDateField onChange={() => { onSuggestionContextChange?.(); controller.clearProposal() }} lockedGeneral={lockedGeneral} formHelpers={formHelpers} onRecurrence={controller.setRecurrence} />

            <HabitScheduleFields
              hidden={itemType === 'task'}
              proposed={proposal.setup}
              unit={frequencyUnit ?? null}
              quantity={watchedQuantity ?? null}
              flexible={isFlexible}
              disabled={disabled || lockedGeneral === true}
              onModeChange={controller.setScheduleMode}
              onChange={controller.setSchedule}
            />
            <HabitMonthDaysField
              visible={itemType !== 'task' && hasHabitMonthDaySchedule({ frequencyUnit, isFlexible, isGeneral: formHelpers.isGeneral })}
              monthDays={monthDays}
              anchorDay={monthDayAnchor}
              quantity={frequencyQuantity}
              proposed={proposal.setup}
              disabled={disabled || lockedGeneral === true}
              onToggle={guard((day: number) => controller.toggleMonthDay(day, monthDayAnchor, monthDays))}
            />
      </HabitUnderstanding>
      <HabitRepeatInterval visible={isFlexible || Boolean(frequencyUnit)} intervalWeeks={intervalWeeks} scheduleLocked={lockedGeneral === true} onIntervalWeeksChange={controller.setIntervalWeeks} labels={understandingLabels} />

      <AstraFallback
        tokens={tokens}
        onAsk={() => void controller.askAstra()}
        {...astraFallbackCopy}
        isSuggesting={isSuggesting}
        atLimit={atMessageLimit}
        visible={itemType !== 'task' && !formHelpers.isGeneral && shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
      />


            <HabitTimingField formHelpers={formHelpers} controller={controller} reminderTimes={reminderTimes} onReminderTimesChange={guard(onReminderTimesChange)} showError={showError} tokens={tokens} />

      <View style={styles.disclosure}>
        <ListRow disabled={disabled} icon={detailsOpen ? 'chevron-down' : 'chevron-right'} title={t('habits.form.moreDetails')} expanded={detailsOpen} placement="column" chevron={false} onClick={() => setDetailsOpen((open) => !open)} />
        {detailsOpen ? (
          <Animated.View entering={DISCLOSURE_ENTER} exiting={DISCLOSURE_EXIT} style={styles.details}>
            <View style={{ gap: 16 }}>
              <FormSectionLabel>{t('habits.form.steps')}</FormSectionLabel>
            <View style={{ gap: 8 }}>
              <FormSectionLabel>{t('habits.form.checklistQuestion')}</FormSectionLabel>
              <HabitChecklist pendingItemText={pendingChecklistItem} onPendingItemChange={onPendingChecklistItemChange} items={checklistItems} editable proposedItemCount={proposal.checklistItems} onItemsChange={controller.setChecklistItems} />
              <ChecklistTemplates items={checklistItems} onLoad={controller.setChecklistItems} />
            </View>
            <SubHabitSection task={itemType === 'task'} proposed={proposal.subHabits && !rendersGranularSubHabits} t={t}>
              {subHabitChildren}
            </SubHabitSection>
            </View>
            <HabitAvoidanceFields formHelpers={formHelpers} controller={controller} hasProAccess={hasProAccess} tokens={tokens} onUpgrade={onUpgrade} />
            <View style={{ gap: 16 }}>
              <FormSectionLabel>{t('habits.form.organize')}</FormSectionLabel>
            {parentField}
            <HabitTagsField tags={tags} title={title} description={description} />
            <View><GoalLinkingField habitId={habitId} onGoalCreated={guard(onGoalCreated ?? onToggleGoal)} selectedGoalIds={selectedGoalIds} atGoalLimit={atGoalLimit} onToggleGoal={guard(onToggleGoal)} /></View>
            </View>
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
