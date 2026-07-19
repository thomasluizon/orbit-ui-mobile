import { useCallback, useMemo, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Plus, X } from '@/components/ui/icons'
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

type AppTokens = ReturnType<typeof createTokensV2>

interface ChecklistTemplatesProps {
  items: ChecklistItem[]
  onLoad: (items: ChecklistItem[]) => void
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
  const [showSave, setShowSave] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const isDeletingThisTemplate = useCallback(
    (id: string) => deleteTemplate.isPending && deleteTemplate.variables === id,
    [deleteTemplate.isPending, deleteTemplate.variables],
  )

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
  }, [onLoad, templates])

  const handleDelete = useCallback((id: string) => {
    deleteTemplate.mutate(id, {
      onError: () => {
        showError(t('habits.form.deleteTemplateError'))
      },
    })
  }, [deleteTemplate, showError, t])

  if (items.length === 0 && templates.length === 0 && !showSave) {
    return null
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionsRow}>
        {items.length > 0 && !showSave ? (
          <Pressable
            style={({ pressed }) => [
              styles.saveChip,
              pressed ? { opacity: 0.8 } : null,
            ]}
            onPress={() => setShowSave(true)}
            accessibilityRole="button"
            accessibilityLabel={t('habits.form.saveAsTemplate')}
            accessibilityHint={t('habits.form.templateNamePlaceholder')}
          >
            <Plus size={14} color={tokens.fg2} strokeWidth={2} />
            <Text style={styles.saveChipText}>{t('habits.form.saveAsTemplate')}</Text>
          </Pressable>
        ) : null}

        {templates.length > 0 ? (
          <View style={styles.templatesWrap}>
            <Text style={styles.templatesLabel}>{t('habits.form.templates')}:</Text>
            <View style={styles.chipsRow}>
              {templates.map((template) => (
                <View key={template.id} style={styles.chip}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.chipLoadButton,
                      pressed ? { opacity: 0.8 } : null,
                    ]}
                    onPress={() => handleLoad(template.id)}
                    accessibilityRole="button"
                    accessibilityLabel={template.name}
                    accessibilityHint={t('habits.form.templates')}
                  >
                    <Text style={styles.chipText}>{template.name}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t('common.delete')}
                    accessibilityRole="button"
                    accessibilityHint={template.name}
                    accessibilityState={{ disabled: isDeletingThisTemplate(template.id) }}
                    style={({ pressed }) => [
                      styles.chipDeleteButton,
                      isDeletingThisTemplate(template.id) && styles.chipDeleteButtonDisabled,
                      pressed ? { opacity: 0.8 } : null,
                    ]}
                    onPress={() => handleDelete(template.id)}
                    disabled={isDeletingThisTemplate(template.id)}
                  >
                    <X size={13} color={tokens.fg3} strokeWidth={1.8} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

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
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      gap: 10,
    },
    actionsRow: {
      gap: 8,
    },
    saveChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
    },
    saveChipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
    templatesWrap: {
      gap: 6,
    },
    templatesLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      color: tokens.fg3,
      textTransform: 'uppercase',
      letterSpacing: 0.96,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgElev,
      overflow: 'hidden',
    },
    chipLoadButton: {
      minHeight: 36,
      justifyContent: 'center',
      paddingLeft: 12,
      paddingVertical: 8,
      paddingRight: 4,
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
    chipDeleteButton: {
      minHeight: 36,
      justifyContent: 'center',
      paddingLeft: 4,
      paddingRight: 10,
      paddingVertical: 8,
    },
    chipDeleteButtonDisabled: {
      opacity: 0.5,
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
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
    },
    saveButton: {
      minHeight: 44,
      borderRadius: 999,
      backgroundColor: tokens.primary,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fgOnPrimary,
    },
    closeButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
