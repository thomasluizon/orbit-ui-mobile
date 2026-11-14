import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { applyChecklistTemplate } from '@orbit/shared/utils'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Skeleton } from '@/components/ui/skeleton'
import { useChecklistTemplates, useCreateChecklistTemplate, useDeleteChecklistTemplate } from '@/hooks/use-checklist-templates'
import { nestedControlFill, useRowFeedback } from '@/hooks/use-row-feedback'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import { useListRowMotion } from './list-row-motion'
import { useAccountScopedState } from '@/hooks/use-session-reset'

/** The quick options show the first saved templates. Every template stays reachable in the list under them. */
const QUICK_TEMPLATES = 4

type Tokens = ReturnType<typeof useThemeTokens>

function TemplateRow({ template, label, loadable, tokens, onLoad, onDelete }: Readonly<{
  template: ChecklistTemplate
  label: string
  loadable: boolean
  tokens: Tokens
  onLoad: () => void
  onDelete: () => void
}>) {
  const { t } = useTranslation()
  const loadFeedback = useRowFeedback(false)
  const deleteFeedback = useRowFeedback(false)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const name = <Text style={styles.name}>{label}</Text>
  return (
    <View testID="template-row" style={styles.row}>
      {loadable
        ? <MotionPressable accessibilityRole="button" accessibilityLabel={label} {...loadFeedback.handlers} style={[styles.load, { backgroundColor: loadFeedback.highlighted ? tokens.bgHover : 'transparent' }]} onPress={onLoad}>{name}</MotionPressable>
        : <View style={styles.load}>{name}</View>}
      <MotionPressable accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${template.name}`} focusInset {...deleteFeedback.handlers}
        style={[styles.delete, { backgroundColor: nestedControlFill(deleteFeedback, tokens) }]} onPress={onDelete}>
        <Icon name="trash" size={20} color={tokens.statusBad} />
      </MotionPressable>
    </View>
  )
}

/** The question "Qual modelo você quer usar?": a press on a template loads its items. Delete stays on each template. */
export function useTemplateQuestionView({ onLoad, onWrite }: Readonly<{ onLoad: (items: ChecklistItem[]) => void; onWrite: () => void }>): FlowStepView {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const { data: templates = [], isLoading, isError, refetch } = useChecklistTemplates()
  const motion = useListRowMotion(templates.map((template) => template.id), !isLoading)
  const deleteTemplate = useDeleteChecklistTemplate()
  const [deleteError, setDeleteError] = useState('')
  const label = (template: ChecklistTemplate) => t('habits.flow.templates.option', { name: template.name, count: template.items.length })
  const load = (template: ChecklistTemplate) => onLoad(applyChecklistTemplate(template))
  const remove = (id: string) => {
    setDeleteError('')
    deleteTemplate.mutate(id, { onError: () => setDeleteError(t('habits.form.deleteTemplateError')) })
  }
  const empty = !isLoading && !isError && templates.length === 0
  let free = <PillButton variant="ghost" onClick={onWrite}>{t('habits.flow.templates.write')}</PillButton>
  if (isLoading) free = <Skeleton variant="settings" rows={2} label={t('common.loading')} />
  else if (isError) free = <><InlineLoadError message={t('habits.flow.templates.loadError')} onRetry={() => void refetch()} />{free}</>
  else if (!empty) free = <View style={staticStyles.rows}>
    {templates.map((template) => <Animated.View key={template.id} entering={motion.enteringFor(template.id)} exiting={motion.exiting} layout={motion.layout}>
      <TemplateRow template={template} label={label(template)} loadable={templates.length > QUICK_TEMPLATES} tokens={tokens} onLoad={() => load(template)} onDelete={() => remove(template.id)} />
    </Animated.View>)}
    {deleteError ? <Text accessibilityRole="alert" style={[staticStyles.error, { color: tokens.statusBadText }]}>{deleteError}</Text> : null}
  </View>
  return {
    question: t('habits.flow.templates.question'),
    line: empty ? t('habits.flow.templates.lineEmpty') : t('habits.flow.templates.line'),
    options: templates.length > 0
      ? <>{templates.slice(0, QUICK_TEMPLATES).map((template) => <OptionCard key={template.id} label={label(template)} onSelect={() => load(template)} />)}</>
      : undefined,
    free,
  }
}

/** The question "Que nome vai ter esse modelo?": one name field keeps the current list as a template. */
export function useSaveTemplateView({ items, onSaved }: Readonly<{ items: ChecklistItem[]; onSaved: () => void }>): FlowStepView {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const createTemplate = useCreateChecklistTemplate()
  const [name, setName] = useAccountScopedState('')
  const [hint, setHint] = useState<string | undefined>()
  const [focusRequest, setFocusRequest] = useState(0)
  const [saveError, setSaveError] = useState('')
  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) { setHint(t('habits.flow.templates.nameHint')); setFocusRequest((request) => request + 1); return }
    if (createTemplate.isPending) return
    setSaveError('')
    createTemplate.mutate({ name: trimmed, items: items.map((item) => item.text) }, {
      onSuccess: () => { setName(''); onSaved() },
      onError: () => setSaveError(t('habits.form.saveTemplateError')),
    })
  }
  return {
    question: t('habits.flow.templates.saveQuestion'),
    line: t('habits.flow.templates.saveLine'),
    free: <>
      <Input autoFocus label={t('habits.flow.templates.saveQuestion')} hideLabel value={name} placeholder={t('habits.form.templateNamePlaceholder')}
        error={hint} focusRequest={focusRequest} onChange={(value) => { setHint(undefined); setName(value) }} onSubmit={save} />
      {saveError ? <Text accessibilityRole="alert" style={[staticStyles.error, { color: tokens.statusBadText }]}>{saveError}</Text> : null}
    </>,
    primary: { label: t('common.save'), onPress: save, loading: createTemplate.isPending },
  }
}

const staticStyles = StyleSheet.create({
  rows: { gap: 4 },
  error: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
    load: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 },
    name: { color: tokens.fg1, fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
    delete: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  })
}
