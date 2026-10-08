import { usePrefersReducedMotion } from '@/lib/motion'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useCallback, useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { X } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
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
  return (
    <View style={styles.emptyState}>
      <Text numberOfLines={1} style={styles.emptyTitle}>{translate('habits.form.noTemplates')}</Text>
      <Text style={styles.emptyDescription}>{translate('habits.form.noTemplatesDescription')}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} style={[styles.emptyAction, !canSave ? styles.saveButtonDisabled : null]} onPress={onSave}>
        <Text numberOfLines={1} style={styles.emptyActionText}>{translate('habits.form.saveCurrentList')}</Text>
      </Pressable>
      {!canSave ? <Text style={styles.emptyReason}>{translate('habits.form.saveCurrentListDisabled')}</Text> : null}
    </View>
  )
}

export function ChecklistTemplates({
  items,
  onLoad,
}: Readonly<ChecklistTemplatesProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
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
  const [open, setOpen] = useState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const [showSave, setShowSave] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const handleSave = useCallback(() => {
    const name = templateName.trim()
    if (!name || items.length === 0 || createTemplate.isPending) return

    createTemplate.mutate(
      { name, items: items.map((item) => item.text) },
      {
        onSuccess: () => {
          setTemplateName('')
          setShowSave(false)
        },
        onError: () => {
          showError(t('habits.form.saveTemplateError'))
        },
      },
    )
  }, [createTemplate, items, showError, t, templateName])

  const handleLoad = useCallback((id: string) => {
    const template = templates.find((entry) => entry.id === id)
    if (!template) return
    closeSheet(() => {
      setOpen(false)
      onLoad(applyChecklistTemplate(template))
    })
  }, [closeSheet, onLoad, templates])

  const handleDelete = useCallback((id: string) => {
    deleteTemplate.mutate(id, {
      onError: () => {
        showError(t('habits.form.deleteTemplateError'))
      },
    })
  }, [deleteTemplate, showError, t])

  return (
    <>
      <View style={styles.formRow}>
        <ListRow
          icon="template"
          title={t('habits.form.useTemplate')}
          compact
          inset={false}
          onClick={() => setOpen(true)}
        />
      </View>
      {open ? (
        <Sheet ref={sheetRef} open title={t('habits.form.templates')} onClose={() => setOpen(false)}>
          <View style={styles.container}>
            {templates.length > 0 && items.length > 0 && !showSave ? (
              <ListRow
                icon="device-floppy"
                title={t('habits.form.saveAsTemplate')}
                chevron={false}
                onClick={() => setShowSave(true)}
              />
            ) : null}
            {showSave ? (
              <View style={styles.saveRow}>
          <BottomSheetAppTextInput
            value={templateName}
            placeholder={t('habits.form.templateNamePlaceholder')}
            style={styles.input}
            accessibilityLabel={t('habits.form.templateNamePlaceholder')}
            accessibilityHint={t('habits.form.saveAsTemplate')}
            onChangeText={setTemplateName}
            onSubmitEditing={handleSave}
            returnKeyType="done"
          />
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              (!templateName.trim() || createTemplate.isPending) && styles.saveButtonDisabled,
              pressed ? { backgroundColor: tokens.primaryPressed, transform: [{ scale: prefersReducedMotion ? 1 : 0.96 }] } : null,
            ]}
            onPress={handleSave}
            disabled={!templateName.trim() || createTemplate.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: !templateName.trim() || createTemplate.isPending }}
          >
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: prefersReducedMotion ? 1 : 0.96 }] } : null,
            ]}
            onPress={() => {
              setTemplateName('')
              setShowSave(false)
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <X size={16} color={tokens.fg3} strokeWidth={1.8} />
          </Pressable>
              </View>
            ) : null}
            {templates.map((template) => (
              <View key={template.id} style={styles.templateRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={template.name} focusInset style={({ pressed }) => [styles.templateLoad, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]} onPress={() => handleLoad(template.id)}>
                  <PersonalText style={styles.templateName}>{template.name}</PersonalText>
                </Pressable>
                <View style={styles.templateActions}>
                  <Icon name="template" size={20} color={tokens.fg3} />
                  <Text style={styles.templateCount}>{t('habits.form.templateItemCount', { count: template.items.length })}</Text>
                  <PersonalTextDetails iconOnly>{template.name}</PersonalTextDetails>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${template.name}`} focusInset style={({ pressed }) => [styles.templateDelete, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]} onPress={() => handleDelete(template.id)}>
                    <Icon name="trash" size={20} color={tokens.statusBad} />
                  </Pressable>
                </View>
              </View>
            ))}
            {templates.length === 0 && !showSave ? <ChecklistTemplatesEmptyState canSave={items.length > 0} onSave={() => setShowSave(true)} styles={styles} translate={t} /> : null}
          </View>
        </Sheet>
      ) : null}
    </>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    templateRow: { minWidth: 0, gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
    templateLoad: { overflow: 'hidden', minWidth: 0, minHeight: TOUCH_TARGET_MIN, width: '100%', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center' },
    templateName: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 23.8, color: tokens.fg1 },
    templateActions: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
    templateCount: { flex: 1, minWidth: 0, fontFamily: 'Geist_400Regular', fontSize: 14, color: tokens.fg3 },
    templateDelete: { overflow: 'hidden', width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    formRow: { paddingTop: 8 },
    container: {
      gap: 4,
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
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgField,
      paddingHorizontal: 12,
      color: tokens.fg1,
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
    },
    saveButton: {
      overflow: 'hidden',
      minHeight: TOUCH_TARGET_MIN,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      paddingHorizontal: 12,
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
    emptyState: { alignItems: 'center', gap: 12, paddingVertical: 32 },
    emptyTitle: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'center' },
    emptyDescription: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
    emptyAction: { backgroundColor: tokens.bgWell, borderRadius: 999, minHeight: TOUCH_TARGET_MIN, justifyContent: 'center', paddingHorizontal: 16 },
    emptyActionText: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
    emptyReason: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 12, textAlign: 'center' },
  })
}
