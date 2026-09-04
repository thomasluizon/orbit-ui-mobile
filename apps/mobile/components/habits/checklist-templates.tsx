import { useCallback, useMemo, useState } from 'react'
import {
  Pressable,
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
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'

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
    onLoad(applyChecklistTemplate(template))
    setOpen(false)
  }, [onLoad, templates])

  const handleDelete = useCallback((id: string) => {
    deleteTemplate.mutate(id, {
      onError: () => {
        showError(t('habits.form.deleteTemplateError'))
      },
    })
  }, [deleteTemplate, showError, t])

  return (
    <>
      <ListRow
        inset={false}
        icon="template"
        title={t('habits.form.templates')}
        value={templates.length > 0 ? String(templates.length) : undefined}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <Sheet open title={t('habits.form.templates')} onClose={() => setOpen(false)}>
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
              pressed ? { opacity: 0.8 } : null,
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
              pressed ? { opacity: 0.8 } : null,
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
              <ListRow
                key={template.id}
                icon="template"
                title={template.name}
                description={t('habits.form.templateItemCount', { count: template.items.length })}
                chevron={false}
                action={{
                  icon: 'trash',
                  label: `${t('common.delete')}: ${template.name}`,
                  danger: true,
                  onPress: () => handleDelete(template.id),
                }}
                onClick={() => handleLoad(template.id)}
              />
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
      minHeight: 44,
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
      minHeight: 44,
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
      fontSize: 13,
      color: tokens.fgOnPrimary,
    },
    closeButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 32 },
    emptyTitle: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'center' },
    emptyDescription: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
    emptyAction: { backgroundColor: tokens.bgWell, borderRadius: 999, minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
    emptyActionText: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
    emptyReason: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 12, textAlign: 'center' },
  })
}
