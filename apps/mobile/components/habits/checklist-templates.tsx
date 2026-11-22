import { useHabitFormInteraction } from './habit-form-fields/habit-form-interaction'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { X } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import { nestedControlFill, surfaceHighlighted, useRowFeedback } from '@/hooks/use-row-feedback'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { applyChecklistTemplate } from '@orbit/shared/utils'
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} from '@/hooks/use-checklist-templates'
import { useAppToast } from '@/hooks/use-app-toast'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { Icon } from '@/components/ui/icon'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { SkeletonFace } from '@/components/ui/skeleton'
import { waitingFaceStyle, waitingTextColor } from '@/components/ui/pill-button'
import { useSubmitHold } from '@/hooks/use-submit-hold'

type AppTokens = ReturnType<typeof createTokensV2>

interface ChecklistTemplatesProps {
  items: ChecklistItem[]
  onLoad: (items: ChecklistItem[]) => void
}

interface ChecklistTemplatesEmptyStateProps {
  canSave: boolean
  onSave: () => void
  styles: ReturnType<typeof createStyles>
  translate: (key: string) => string
}

function ChecklistTemplatesEmptyState({ canSave, onSave, styles, translate }: Readonly<ChecklistTemplatesEmptyStateProps>) {
  const { disabled } = useHabitFormInteraction()
  return (
    <View style={styles.emptyState}>
      <Text numberOfLines={1} style={styles.emptyTitle}>{translate('habits.form.noTemplates')}</Text>
      <Text style={styles.emptyDescription}>{translate('habits.form.noTemplatesDescription')}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || !canSave }} disabled={disabled || !canSave} style={({ pressed }) => [styles.emptyAction, !canSave ? styles.saveButtonDisabled : null, pressed ? styles.emptyActionPressed : null]} onPress={onSave}>
        <Text numberOfLines={1} style={styles.emptyActionText}>{translate('habits.form.saveCurrentList')}</Text>
      </Pressable>
      {!canSave ? <Text style={styles.emptyReason}>{translate('habits.form.saveCurrentListDisabled')}</Text> : null}
    </View>
  )
}

interface TemplateSaveEditorProps {
  name: string
  waiting: boolean
  onChange: (name: string) => void
  onSave: () => void
  onCancel: () => void
  styles: ReturnType<typeof createStyles>
  tokens: AppTokens
}

function TemplateSaveEditor({ name, waiting, onChange, onSave, onCancel, styles, tokens }: Readonly<TemplateSaveEditorProps>) {
  const { disabled, guard, isDisabled } = useHabitFormInteraction()
  const { t } = useTranslation()
  return (
    <View style={styles.saveRow}>
      <BottomSheetAppTextInput isChangeDisabled={isDisabled}
        editable={!disabled && !waiting}
        accessibilityState={{ disabled: disabled || waiting }}
        value={name}
        placeholder={t('habits.form.templateNamePlaceholder')}
        style={styles.input}
        accessibilityLabel={t('habits.form.templateNamePlaceholder')}
        accessibilityHint={t('habits.form.saveAsTemplate')}
        onChangeText={guard(onChange)}
        onSubmitEditing={onSave}
        returnKeyType="done"
      />
      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          waiting && waitingFaceStyle('primary', 0),
          !name.trim() && !waiting && styles.saveButtonDisabled,
          pressed && !waiting ? { backgroundColor: tokens.primaryPressed } : null,
        ]}
        onPress={onSave}
        disabled={disabled || !name.trim() || waiting}
        accessibilityRole="button"
        accessibilityLabel={t('common.save')}
        accessibilityState={{ disabled: disabled || !name.trim() || waiting, busy: waiting }}
      >
        {waiting ? <SkeletonFace tokens={tokens} /> : null}
        <Text style={[styles.saveButtonText, waiting && { color: waitingTextColor(tokens, 'primary', false) }]}>{t('common.save')}</Text>
      </Pressable>
      <Pressable
        disabled={disabled || waiting}
        style={({ pressed }) => [
          styles.closeButton,
          pressed ? { backgroundColor: tokens.bgHover } : null,
        ]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={16} color={tokens.fg3} strokeWidth={2} />
      </Pressable>
    </View>
  )
}

export function ChecklistTemplates({
  items,
  onLoad,
}: Readonly<ChecklistTemplatesProps>) {
  const { disabled, isDisabled } = useHabitFormInteraction()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { showError } = useAppToast()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { data: templates = [] } = useChecklistTemplates()
  const createTemplate = useCreateChecklistTemplate()
  const deleteTemplate = useDeleteChecklistTemplate()
  const saving = useSubmitHold()
  const [open, setOpen] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const [clampedTemplates, setClampedTemplates] = useState<Record<string, boolean>>({})
  const [showSave, setShowSave] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const dismissActionRef = useRef<() => void>(() => {})
  const finishClose = () => { setOpen(false); setShowSave(false); setTemplateName('') }
  const dismiss = useDismissGuard({ isDirty: showSave && templateName.length > 0, onDismiss: () => dismissActionRef.current() })
  const requestDismiss = (action = () => closeSheet(finishClose)) => {
    if (saving.isRunning()) return
    dismissActionRef.current = action
    dismiss.requestDismiss()
  }
  const cancelEditor = () => requestDismiss(() => { setTemplateName(''); setShowSave(false) })

  const handleSave = () => {
    const name = templateName.trim()
    if (isDisabled() || !name || items.length === 0) return
    void saving.run(async (startRequest) => {
      startRequest()
      try {
        await createTemplate.mutateAsync({ name, items: items.map((item) => item.text) })
        setTemplateName('')
        setShowSave(false)
      } catch {
        showError(t('habits.form.saveTemplateError'))
      }
      return 'stay'
    })
  }

  function handleLoad(id: string) {
    const template = templates.find((entry) => entry.id === id)
    if (isDisabled() || !template) return
    requestDismiss(() => closeSheet(() => {
      finishClose()
      onLoad(applyChecklistTemplate(template))
    }))
  }

  const handleDelete = useCallback((id: string) => {
    if (isDisabled()) return
    deleteTemplate.mutate(id, {
      onError: () => {
        showError(t('habits.form.deleteTemplateError'))
      },
    })
  }, [deleteTemplate, isDisabled, showError, t])

  return (
    <>
      <View style={styles.formRow}>
        <ListRow
          disabled={disabled}
          icon="template"
          title={t('habits.form.useTemplate')}
          compact
          placement="field"
          onClick={() => setOpen(true)}
        />
      </View>
      {open ? (
        <Sheet ref={sheetRef} open title={t('habits.form.templates')} onClose={!saving.waiting && dismiss.canDismiss ? finishClose : undefined} onAttemptDismiss={() => requestDismiss()}>
          <View style={styles.container}>
            {templates.length > 0 && items.length > 0 && !showSave ? (
              <ListRow
          disabled={disabled}
                icon="device-floppy"
                title={t('habits.form.saveAsTemplate')}
                chevron={false}
                onClick={() => setShowSave(true)}
              />
            ) : null}
            {showSave ? (
              <TemplateSaveEditor name={templateName} waiting={saving.waiting} onChange={setTemplateName} onSave={handleSave} onCancel={cancelEditor} styles={styles} tokens={tokens} />
            ) : null}
            {templates.map((template) => (
              <TemplateRow key={template.id} template={template} disabled={disabled} styles={styles} tokens={tokens}
                clamped={clampedTemplates[template.id]} onClampedChange={(clamped) => setClampedTemplates((current) => current[template.id] === clamped ? current : { ...current, [template.id]: clamped })}
                onLoad={() => handleLoad(template.id)} onDelete={() => handleDelete(template.id)} />
            ))}
            {templates.length === 0 && !showSave ? <ChecklistTemplatesEmptyState canSave={items.length > 0} onSave={() => setShowSave(true)} styles={styles} translate={t} /> : null}
          </View>
          <DiscardChangesSheet open={dismiss.showDiscardDialog} onKeepEditing={dismiss.cancelDismiss} onDiscard={dismiss.confirmDismiss} />
        </Sheet>
      ) : null}
    </>
  )
}

function TemplateRow({ template, disabled, styles, tokens, clamped, onClampedChange, onLoad, onDelete }: Readonly<{
  template: ChecklistTemplate
  disabled: boolean
  styles: ReturnType<typeof createStyles>
  tokens: AppTokens
  clamped?: boolean
  onClampedChange: (clamped: boolean) => void
  onLoad: () => void
  onDelete: () => void
}>) {
  const { t } = useTranslation()
  const bodyFeedback = useRowFeedback(disabled)
  const deleteFeedback = useRowFeedback(disabled)
  const highlighted = surfaceHighlighted(bodyFeedback.highlighted, [deleteFeedback])
  return <View style={[styles.templateRow, { borderRadius: 12 }]}>
    <View pointerEvents="none" accessible={false} testID="template-row-feedback" style={[StyleSheet.absoluteFill, { borderRadius: 12, backgroundColor: highlighted ? tokens.bgHover : 'transparent', outlineWidth: bodyFeedback.focused ? 2 : 0, outlineStyle: 'solid', outlineColor: tokens.fg1, outlineOffset: -2 }]} />
    <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={template.name} {...bodyFeedback.handlers} style={styles.templateLoad} onPress={onLoad}>
      <PersonalText onClampedChange={onClampedChange} style={styles.templateName}>{template.name}</PersonalText>
    </Pressable>
    <View style={styles.templateActions}>
      <Icon name="template" size={20} color={tokens.fg3} />
      <Text style={[styles.templateCount, highlighted ? { color: tokens.fg2 } : null]}>{t('habits.form.templateItemCount', { count: template.items.length })}</Text>
      <PersonalTextDetails iconOnly clamped={clamped}>{template.name}</PersonalTextDetails>
      <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${template.name}`} focusInset {...deleteFeedback.handlers} style={[styles.templateDelete, { backgroundColor: nestedControlFill(deleteFeedback, tokens) }]} onPress={onDelete}>
        <Icon name="trash" size={20} color={tokens.statusBad} />
      </Pressable>
    </View>
  </View>
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    templateRow: { minWidth: 0, gap: 4, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s8 },
    templateLoad: { overflow: 'hidden', minWidth: 0, minHeight: TOUCH_TARGET_MIN, width: '100%', borderRadius: 12, paddingHorizontal: SPACING.s8, paddingVertical: SPACING.s4, justifyContent: 'center' },
    templateName: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8, color: tokens.fg1 },
    templateActions: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.s8 },
    templateCount: { flex: 1, minWidth: 0, fontFamily: 'Geist_400Regular', fontSize: 14, color: tokens.fg3 },
    templateDelete: { overflow: 'hidden', width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    formRow: { paddingTop: SPACING.s8 },
    container: {
      gap: 8,
    },
    saveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: TOUCH_TARGET_MIN,
      borderRadius: 12,
      backgroundColor: tokens.bgField,
      paddingHorizontal: SPACING.s12,
      color: tokens.fg1,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
    },
    saveButton: {
      overflow: 'hidden',
      minHeight: TOUCH_TARGET_MIN,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      paddingHorizontal: SPACING.s12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonText: {
      fontFamily: 'Geist_500Medium',
      fontSize: 14,
      color: tokens.fgOnPrimary,
    },
    closeButton: {
      borderRadius: 999,
      overflow: 'hidden',
      width: TOUCH_TARGET_MIN,
      height: TOUCH_TARGET_MIN,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: { alignItems: 'center', gap: 12, paddingVertical: SPACING.s32 },
    emptyTitle: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'center' },
    emptyDescription: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
    emptyAction: { backgroundColor: tokens.bgWell, borderRadius: 999, overflow: 'hidden', minHeight: TOUCH_TARGET_MIN, justifyContent: 'center', paddingHorizontal: SPACING.s16 },
    emptyActionPressed: { backgroundColor: tokens.bgHover },
    emptyActionText: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
    emptyReason: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 12, textAlign: 'center' },
  })
}
