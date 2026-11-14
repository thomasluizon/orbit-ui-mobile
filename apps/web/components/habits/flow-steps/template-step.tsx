'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { applyChecklistTemplate } from '@orbit/shared/utils'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { PillButton } from '@/components/ui/pill-button'
import { InlineLoadError } from '@/components/ui/inline-load-error'
import { Skeleton } from '@/components/ui/skeleton'
import { useChecklistTemplates, useCreateChecklistTemplate, useDeleteChecklistTemplate } from '@/hooks/use-checklist-templates'
import { useAccountScopedState } from '@/hooks/use-session-reset'

/** The quick options show the first saved templates. Every template stays reachable in the list under them. */
const QUICK_TEMPLATES = 4

function TemplateRow({ template, label, loadable, onLoad, onDelete }: Readonly<{
  template: ChecklistTemplate
  label: string
  loadable: boolean
  onLoad: () => void
  onDelete: () => void
}>) {
  const t = useTranslations()
  return (
    <div data-template-row="" className="orbit-list-action-surface flex min-h-12 min-w-0 items-center gap-2">
      {loadable
        ? <button type="button" className="orbit-list-row-body min-h-12 min-w-0 flex-1 rounded-[12px] px-3 text-start text-base text-[var(--fg-1)] motion-safe:enabled:active:scale-[0.96]" onClick={onLoad}>{label}</button>
        : <span className="min-w-0 flex-1 px-3 text-base text-[var(--fg-1)]">{label}</span>}
      <button type="button" aria-label={`${t('common.delete')}: ${template.name}`} className="orbit-list-row-action grid size-[var(--touch-min)] shrink-0 place-items-center rounded-full motion-safe:enabled:active:scale-[0.96]" onClick={onDelete}>
        <Icon name="trash" size={20} color="var(--status-bad)" />
      </button>
    </div>
  )
}

/** The question "Qual modelo você quer usar?": a press on a template loads its items. Delete stays on each template. */
export function useTemplateQuestionView({ onLoad, onWrite }: Readonly<{ onLoad: (items: ChecklistItem[]) => void; onWrite: () => void }>): FlowStepView {
  const t = useTranslations()
  const { data: templates = [], isLoading, isError, refetch } = useChecklistTemplates()
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
  else if (!empty) free = <div className="flex flex-col gap-1">
    <ListPresence>{templates.map((template) => <ListMotionItem key={template.id}>
      <TemplateRow template={template} label={label(template)} loadable={templates.length > QUICK_TEMPLATES} onLoad={() => load(template)} onDelete={() => remove(template.id)} />
    </ListMotionItem>)}</ListPresence>
    {deleteError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{deleteError}</p> : null}
  </div>
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
  const t = useTranslations()
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
      <Input autoFocus label={t('habits.flow.templates.saveQuestion')} hideLabel name="templateName" value={name} placeholder={t('habits.form.templateNamePlaceholder')}
        error={hint} focusRequest={focusRequest} onChange={(value) => { setHint(undefined); setName(value) }} onSubmit={save} />
      {saveError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{saveError}</p> : null}
    </>,
    primary: { label: t('common.save'), onPress: save, loading: createTemplate.isPending },
  }
}
