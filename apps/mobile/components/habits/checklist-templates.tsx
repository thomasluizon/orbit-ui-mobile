import { useCallback, useMemo, useState } from 'react'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { applyChecklistTemplate } from '@orbit/shared/utils'
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} from '@/hooks/use-checklist-templates'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { useAppTheme } from '@/lib/use-app-theme'

interface ChecklistTemplatesProps {
  items: ChecklistItem[]
  onLoad: (items: ChecklistItem[]) => void
}

export function ChecklistTemplates({
  items,
  onLoad,
}: Readonly<ChecklistTemplatesProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { data: templates = [] } = useChecklistTemplates()
  const createTemplate = useCreateChecklistTemplate()
  const deleteTemplate = useDeleteChecklistTemplate()
  const [showSave, setShowSave] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const handleSave = useCallback(() => {
    const name = templateName.trim()
    if (!name || items.length === 0) return

    createTemplate.mutate(
      { name, items: items.map((item) => item.text) },
      {
        onSuccess: () => {
          setTemplateName('')
          setShowSave(false)
        },
      },
    )
  }, [createTemplate, items, templateName])

  const handleLoad = useCallback((id: string) => {
    const template = templates.find((entry) => entry.id === id)
    if (!template) return
    onLoad(applyChecklistTemplate(template))
  }, [onLoad, templates])

  const handleDelete = useCallback((id: string) => {
    deleteTemplate.mutate(id)
  }, [deleteTemplate])

  if (items.length === 0 && templates.length === 0 && !showSave) {
    return null
  }

  return (
    <View style={styles.container}>
      <View style={styles.actionsRow}>
        {items.length > 0 && !showSave ? (
          <TouchableOpacity
            onPress={() => setShowSave(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('habits.form.saveAsTemplate')}
            accessibilityHint={t('habits.form.templateNamePlaceholder')}
          >
            <Text style={styles.saveLink}>{t('habits.form.saveAsTemplate')}</Text>
          </TouchableOpacity>
        ) : null}

        {templates.length > 0 ? (
          <View style={styles.templatesWrap}>
            <Text style={styles.templatesLabel}>{t('habits.form.templates')}:</Text>
            <View style={styles.chipsRow}>
              {templates.map((template) => (
                <View key={template.id} style={styles.chip}>
                  <TouchableOpacity
                    style={styles.chipLoadButton}
                    onPress={() => handleLoad(template.id)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={template.name}
                    accessibilityHint={t('habits.form.templates')}
                  >
                    <Text style={styles.chipText}>{template.name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityLabel={t('common.delete')}
                    accessibilityRole="button"
                    accessibilityHint={template.name}
                    style={styles.chipDeleteButton}
                    onPress={() => handleDelete(template.id)}
                    activeOpacity={0.8}
                  >
                    <X size={12} color={colors.textMuted} />
                  </TouchableOpacity>
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
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            accessibilityLabel={t('habits.form.templateNamePlaceholder')}
            accessibilityHint={t('habits.form.saveAsTemplate')}
            onChangeText={setTemplateName}
            onSubmitEditing={handleSave}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!templateName.trim() || createTemplate.isPending) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!templateName.trim() || createTemplate.isPending}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: !templateName.trim() || createTemplate.isPending }}
          >
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              setTemplateName('')
              setShowSave(false)
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <X size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    container: {
      gap: 10,
    },
    actionsRow: {
      gap: 8,
    },
    saveLink: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    templatesWrap: {
      gap: 6,
    },
    templatesLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    chipLoadButton: {
      minHeight: 32,
      paddingLeft: 10,
      paddingVertical: 6,
      paddingRight: 6,
    },
    chipText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    chipDeleteButton: {
      minHeight: 32,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    saveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 40,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      color: colors.textPrimary,
      fontSize: 13,
    },
    saveButton: {
      minHeight: 40,
      borderRadius: 14,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.white,
    },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
