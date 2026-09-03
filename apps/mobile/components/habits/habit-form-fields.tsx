import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { Time24 } from '@orbit/shared/contracts/forms'
import type { ScheduledReminderWhen } from '@orbit/shared/types/habit'
import type { HabitFormCommonProps } from '@orbit/shared/utils'
import {
  buildHabitAstraFallbackCopy,
  buildHabitUnderstandingLabels,
  buildHabitUnderstandingSentence,
  createHabitFormController,
  EMPTY_HABIT_FORM_PROPOSAL,
  coalesceFormText,
  formatHabitReminderLabel,
  formatLocaleDate,
  getFriendlyErrorMessage,
  habitFeaturePlan,
  isFeatureEnabled,
  isHabitAstraLimitReached,
  readHabitPhrase,
  resolveHabitStartDate,
  resolveSupportedLocale,
  shouldShowHabitAstraFallback,
} from '@orbit/shared/utils'
import { MAX_HABIT_DESCRIPTION_LENGTH, validateTagForm } from '@orbit/shared/validation'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { useAppToast } from '@/hooks/use-app-toast'
import { useConfig } from '@/hooks/use-config'
import { useHasProAccess, useProfile } from '@/hooks/use-profile'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/hooks/use-tags'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { ListRow } from '@/components/ui/list-row'
import { Proposed } from '@/components/ui/proposed'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { ChecklistTemplates } from './checklist-templates'
import { GoalLinkingField } from './goal-linking-field'
import { HabitChecklist } from './habit-checklist'
import { HabitUnderstanding } from './habit-form-fields/habit-understanding'
import { ReminderSection } from './habit-form-fields/reminder-section'
import { ScheduledReminderSection } from './habit-form-fields/scheduled-reminder-section'
import { SlipAlertSection } from './habit-form-fields/slip-alert-section'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { TagPickerField } from './habit-form-fields/tag-picker-field'
import { createStyles as createFormStyles } from './habit-form-fields/styles'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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
  unresolved: string
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
  unresolved,
  limitMessage,
  readingLabel,
  askLabel,
  costLabel,
  onAsk,
  tokens,
}: Readonly<AstraFallbackProps>) {
  if (!visible) return null
  return (
    <View style={{ gap: 12 }}>
      {atLimit ? (
        <CapacityNotice message={limitMessage} />
      ) : (
        <Text style={{ borderRadius: 12, backgroundColor: tokens.bgWell, color: tokens.fg2, padding: 12, fontSize: 14, lineHeight: 22 }}>
          {unresolved}
        </Text>
      )}
      {isSuggesting ? (
        <Skeleton variant="settings" label={readingLabel} />
      ) : (
        <View style={{ alignItems: 'flex-start', gap: 8 }}>
          <PillButton variant="secondary" disabled={atLimit} onClick={onAsk}>{askLabel}</PillButton>
          {!atLimit ? <Text style={{ color: tokens.fg3, fontSize: 12 }}>{costLabel}</Text> : null}
        </View>
      )}
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
  canUseSubHabits: boolean
  proposed: boolean
  onUpgrade: () => void
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
  if (!visible) return null
  return (
    <View>
      <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.endDate')}</SectionLabel>
      <DateField value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={onChange} />
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
    <View>
      <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.slipAlert')}</SectionLabel>
      <SlipAlertSection tokens={tokens} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={onToggle} onUpgrade={onUpgrade} />
    </View>
  )
}

function SubHabitSection({
  canUseSubHabits,
  proposed,
  onUpgrade,
  children,
  t,
}: Readonly<SubHabitSectionProps>) {
  return (
    <View>
      <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.subHabits')}</SectionLabel>
      {canUseSubHabits ? (
        <Proposed proposed={proposed && !!children} scope="field" label={t('habits.form.proposed')}>
          {children}
        </Proposed>
      ) : (
        <ListRow title={t('common.upgrade')} value={t('common.proBadge')} onClick={onUpgrade} />
      )}
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
  if (!dueTime) {
    return <ScheduledReminderSection tokens={tokens} reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} />
  }
  return (
    <>
      <ReminderSection tokens={tokens} reminderEnabled={reminderEnabled} reminderTimes={reminderTimes} onReminderTimesChange={onReminderTimesChange} onToggleReminder={onToggle} reminderLabel={(minutes) => formatHabitReminderLabel(minutes, t)} />
      <ScheduledReminderSection tokens={tokens} reminderEnabled={reminderEnabled} scheduledReminders={scheduledReminders} onToggleReminder={onToggle} onSetScheduledReminders={onSetScheduledReminders} onValidationError={onValidationError} nested />
    </>
  )
}

export function HabitFormFields({
  formHelpers,
  tags,
  selectedGoalIds,
  atGoalLimit,
  onToggleGoal,
  reminderTimes,
  onReminderTimesChange,
  onReminderEnabledChange,
  onSlipAlertEnabledChange,
  onSuggestionContextChange,
  onFlushBufferedInputsReady,
  onResolveSubHabitProposalReady,
  expandAdvancedSignal = 0,
  onSuggestSetup,
  isSuggesting = false,
  readPhraseLocally = false,
  lockedGeneral = null,
  onUpgrade,
  startDate,
  defaultExpanded = false,
  children,
}: Readonly<HabitFormFieldsProps>) {
  const { t, i18n } = useTranslation()
  const locale = resolveSupportedLocale(i18n.language)
  const translate = useCallback((key: string, values?: Record<string, unknown>) => t(key, values), [t])
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const { showError } = useAppToast()
  const hasProAccess = useHasProAccess()
  const { config } = useConfig()
  const { profile } = useProfile()
  const { form, daysList, showEndDate, toggleDay, setOneTime, setRecurring, setFlexible, setGeneral } = formHelpers
  const { setValue, formState: { errors } } = form
  const title = coalesceFormText(useWatch({ control: form.control, name: 'title' }))
  const emoji = useWatch({ control: form.control, name: 'emoji' }) ?? ''
  const watchedDays = useWatch({ control: form.control, name: 'days' })
  const days = useMemo(() => watchedDays ?? [], [watchedDays])
  const frequencyQuantity = useWatch({ control: form.control, name: 'frequencyQuantity' }) ?? 3
  const intervalWeeks = useWatch({ control: form.control, name: 'intervalWeeks' }) ?? 1
  const frequencyUnit = useWatch({ control: form.control, name: 'frequencyUnit' })
  const isFlexible = useWatch({ control: form.control, name: 'isFlexible' }) ?? false
  const dueDate = useWatch({ control: form.control, name: 'dueDate' }) ?? ''
  const dueTime = useWatch({ control: form.control, name: 'dueTime' }) ?? ''
  const endDate = useWatch({ control: form.control, name: 'endDate' }) ?? ''
  const description = useWatch({ control: form.control, name: 'description' }) ?? ''
  const reminderEnabled = useWatch({ control: form.control, name: 'reminderEnabled' }) ?? false
  const scheduledReminders = useWatch({ control: form.control, name: 'scheduledReminders' }) ?? []
  const checklistItems = useWatch({ control: form.control, name: 'checklistItems' }) ?? []
  const isBadHabit = useWatch({ control: form.control, name: 'isBadHabit' }) ?? false
  const slipAlertEnabled = useWatch({ control: form.control, name: 'slipAlertEnabled' }) ?? false
  const canUseSubHabits = isFeatureEnabled(config, 'habits.subHabits', habitFeaturePlan(hasProAccess))
  const displayedStartDate = resolveHabitStartDate(startDate, dueDate)
  const [detailsOpen, setDetailsOpen] = useState(defaultExpanded)
  const [proposal, setProposal] = useState(EMPTY_HABIT_FORM_PROPOSAL)
  const rendersGranularSubHabits = typeof children === 'function'
  const subHabitChildren = renderSubHabitChildren(children, proposal.subHabitItems)
  const [phraseOwnership, setPhraseOwnership] = useState({ cadence: false, dueTime: false })
  const lastLocallyReadTitleRef = useRef<string | null>(null)
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
  const localRead = useMemo(
    () => readHabitPhrase(title, locale),
    [locale, title],
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
  const allowance = profile?.aiMessagesLimit ?? 5
  const atMessageLimit = isHabitAstraLimitReached(profile?.aiMessagesUsed ?? 0, allowance)
  const astraFallbackCopy = useMemo(
    () => buildHabitAstraFallbackCopy(translate, allowance),
    [allowance, translate],
  )
  const understandingLabels = useMemo(() => buildHabitUnderstandingLabels(translate), [translate])

  const controller = useMemo(
    () => createHabitFormController({
      onSlipAlertEnabledChange,
      onReminderEnabledChange,
      onSuggestionContextChange,
      lockedGeneral,
      atLimit: atMessageLimit,
      action: onSuggestSetup,
      target: {
        setOneTime,
        setRecurring,
        setFlexible,
        setGeneral,
        toggleDay,
        getOwnership() { return phraseOwnership },
        setOwnership: setPhraseOwnership,
        updateProposal(update) { setProposal(update) },
        setField(field, value, validate = false) {
          const options = validate ? { shouldDirty: true, shouldValidate: true } : { shouldDirty: true }
          setValue(field, value as never, options)
        },
      },
    }),
    [atMessageLimit, lockedGeneral, onReminderEnabledChange, onSlipAlertEnabledChange, onSuggestSetup, onSuggestionContextChange, phraseOwnership, setFlexible, setGeneral, setOneTime, setRecurring, setValue, toggleDay],
  )

  useEffect(() => {
    if (lastLocallyReadTitleRef.current === title) return
    lastLocallyReadTitleRef.current = title
    controller.readPhrase(readPhraseLocally, localRead, emoji)
  }, [controller, emoji, localRead, readPhraseLocally, title])

  useEffect(() => {
    if (!onResolveSubHabitProposalReady) return
    // react-doctor-disable-next-line no-prop-callback-in-effect -- the modal owns this editor; registering its resolver preserves section-specific proposal state https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onResolveSubHabitProposalReady(controller.resolveSubHabitProposal)
    return () => onResolveSubHabitProposalReady(() => {})
  }, [controller, onResolveSubHabitProposalReady])

  async function createNewTag() {
    const validationError = validateTagForm(tags.newTagName, tags.newTagColor)
    if (validationError) {
      showError(translate(validationError))
      return
    }
    await tags.createAndSelectTag(async (name, color) => {
      try {
        return (await createTag.mutateAsync({ name, color })).id
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
        throw error
      }
    })
  }

  async function saveEditedTag() {
    await tags.saveEditTag(async (id, name, color) => {
      try {
        await updateTag.mutateAsync({ tagId: id, name, color })
      } catch (error: unknown) {
        showError(getFriendlyErrorMessage(error, translate, 'toast.errors.validation', 'tag'))
        throw error
      }
    })
  }

  return (
    <View style={styles.container}>
      <HabitUnderstanding
        labels={understandingLabels}
        onQuantityChange={controller.setQuantity}
        onModeChange={controller.setScheduleMode}
        onIntervalWeeksChange={controller.setIntervalWeeks}
        onToggleDay={controller.toggleDay}
        onEmojiSelect={controller.setEmoji}
        onValueChange={controller.setTitle}
        proposed={proposal.setup}
        consumed={localRead.consumed}
        sentence={sentence}
        quantity={frequencyQuantity}
        mode={isFlexible ? 'flexible' : 'fixed'}
        intervalWeeks={intervalWeeks}
        dayOptions={daysList}
        days={days}
        emoji={emoji}
        error={errors.title?.message}
        value={title}
      />

      <AstraFallback
        tokens={tokens}
        onAsk={() => void controller.askAstra()}
        {...astraFallbackCopy}
        isSuggesting={isSuggesting}
        atLimit={atMessageLimit}
        visible={shouldShowHabitAstraFallback(title, sentence, onSuggestSetup, proposal)}
      />

      <View style={styles.disclosure}>
        <ListRow icon={detailsOpen ? 'chevron-down' : 'chevron-right'} title={t('habits.form.moreDetails')} chevron={false} onClick={() => setDetailsOpen((open) => !open)} />
        {detailsOpen ? (
          <View style={styles.details}>
            <View>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.exactTime')}</SectionLabel>
              <TimeField
                label={t('habits.form.exactTime')}
                hint={t('habits.form.anyTimeHint')}
                value={dueTime as Time24 | ''}
                onChange={controller.setDueTime}
                onClear={controller.clearDueTime}
              />
            </View>
            <View>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.reminders')}</SectionLabel>
              <ReminderEditors
                dueTime={dueTime}
                reminderEnabled={reminderEnabled}
                reminderTimes={reminderTimes}
                scheduledReminders={scheduledReminders}
                tokens={tokens}
                onReminderTimesChange={onReminderTimesChange}
                onToggle={() => controller.setReminderEnabled(!reminderEnabled)}
                onSetScheduledReminders={(items) => setValue('scheduledReminders', items, { shouldDirty: true })}
                onValidationError={showError}
                t={t}
              />
            </View>
            <View>
              <SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.checklist')}</SectionLabel>
              <HabitChecklist items={checklistItems} editable proposedItemCount={proposal.checklistItems} onItemsChange={controller.setChecklistItems} />
              <ChecklistTemplates items={checklistItems} onLoad={controller.setChecklistItems} />
            </View>
            <SubHabitSection canUseSubHabits={canUseSubHabits} proposed={proposal.subHabits && !rendersGranularSubHabits} onUpgrade={onUpgrade} t={t}>
              {subHabitChildren}
            </SubHabitSection>
            <View style={styles.avoidRow}>
              <View style={styles.avoidCopy}>
                <Text numberOfLines={1} style={styles.avoidTitle}>{t('habits.form.habitTypeAvoid')}</Text>
                <Text numberOfLines={1} style={styles.hint}>{t('habits.form.habitTypeAvoidHint')}</Text>
              </View>
              <Switch label={t('habits.form.habitTypeAvoid')} checked={isBadHabit} onChange={(checked) => setValue('isBadHabit', checked, { shouldDirty: true })} />
            </View>
            <SlipAlertEditor visible={isBadHabit} tokens={tokens} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} onUpgrade={onUpgrade} t={t} />
            <View><TagPickerField tags={availableTags} selectedIds={tags.selectedTagIds} atLimit={tags.atTagLimit} disabled={tagMutationPending} onToggle={tags.toggleTag} onCreate={() => tags.setShowNewTag(true)} onEdit={tags.startEditTag} onDelete={(id) => void tags.deleteTag(id, async (tagId) => { await deleteTag.mutateAsync(tagId) })} editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')} editor={tags.showNewTag ? <TagEditorRow value={tags.newTagName} placeholder={t('habits.form.tagName')} disabled={createTag.isPending} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t('common.add')} onChange={tags.setNewTagName} onCommit={() => void createNewTag()} onCancel={() => tags.setShowNewTag(false)} styles={formStyles} tokens={tokens} /> : tags.editingTagId ? <TagEditorRow value={tags.editTagName} disabled={updateTag.isPending} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t('common.save')} onChange={tags.setEditTagName} onCommit={() => void saveEditedTag()} onCancel={tags.cancelEditTag} styles={formStyles} tokens={tokens} /> : undefined} />{tags.atTagLimit ? <Text style={styles.hint}>{t('habits.form.tagLimit')}</Text> : null}</View>
            <View><GoalLinkingField selectedGoalIds={selectedGoalIds} atGoalLimit={atGoalLimit} onToggleGoal={onToggleGoal} /></View>
            <EndDateEditor visible={showEndDate} value={endDate} onChange={(value) => setValue('endDate', value, { shouldDirty: true })} t={t} />
            <View><SectionLabel inset={false} top={0} bottom={8}>{t('habits.form.description')}</SectionLabel><Input label={t('habits.form.description')} value={description} onChange={(value) => setValue('description', value, { shouldDirty: true })} placeholder={t('habits.form.descriptionPlaceholder')} multiline rows={3} maxLength={MAX_HABIT_DESCRIPTION_LENGTH} /></View>
          </View>
        ) : null}
      </View>

      {displayedStartDate ? <View style={styles.startDate}><Text style={styles.meta}>{t('habits.form.startDate')}</Text><Text style={styles.startDateValue}>{formatLocaleDate(displayedStartDate, i18n.language)}</Text><Text style={styles.hint}>{t('habits.form.startDateReason')}</Text></View> : null}
    </View>
  )
}

type AppTokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: { gap: 24 }, disclosure: { gap: 12 }, details: { gap: 24, paddingHorizontal: 16 },
    compactGroup: { gap: 8 }, startDate: { gap: 4 },
    avoidRow: { alignItems: 'center', flexDirection: 'row', gap: 16 },
    avoidCopy: { flex: 1, minWidth: 0, gap: 4 },
    avoidTitle: { color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 17 },
    meta: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12 },
    hint: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
    startDateValue: { color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 17 },
  })
}
