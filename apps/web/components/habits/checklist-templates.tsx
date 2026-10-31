'use client'

import { useCallback, useRef, useState } from 'react'
import { X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { applyChecklistTemplate } from '@orbit/shared/utils'
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} from '@/hooks/use-checklist-templates'
import { useAppToast } from '@/hooks/use-app-toast'
import { Icon } from '@/components/ui/icon'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { ListRow } from '@/components/ui/list-row'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { useAccountScopedState } from '@/hooks/use-session-reset'

interface ChecklistTemplatesProps {
  items: ChecklistItem[]
  onLoad: (items: ChecklistItem[]) => void
}

export function ChecklistTemplates({ items, onLoad }: Readonly<ChecklistTemplatesProps>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const { data: templates = [] } = useChecklistTemplates()
  const createTemplate = useCreateChecklistTemplate()
  const deleteTemplate = useDeleteChecklistTemplate()
  const [open, setOpen] = useAccountScopedState(false)
  const { sheetRef, closeSheet } = useSheetHost()
  const [clampedTemplates, setClampedTemplates] = useState<Record<string, boolean>>({})
  const [showSave, setShowSave] = useAccountScopedState(false)
  const [templateName, setTemplateName] = useAccountScopedState('')
  const dismissActionRef = useRef<() => void>(() => {})
  const finishClose = () => { setOpen(false); setShowSave(false); setTemplateName('') }
  const dismiss = useDismissGuard({ isDirty: showSave && templateName.length > 0, onDismiss: () => dismissActionRef.current() })
  const requestDismiss = (action = () => closeSheet(finishClose)) => {
    if (createTemplate.isPending) return
    dismissActionRef.current = action
    dismiss.requestDismiss()
  }
  const cancelEditor = () => requestDismiss(() => { setTemplateName(''); setShowSave(false) })

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
  }, [createTemplate, items, setShowSave, setTemplateName, showError, t, templateName])

  function handleLoad(id: string) {
    const template = templates.find((entry) => entry.id === id)
    if (!template) return
    requestDismiss(() => closeSheet(() => {
      finishClose()
      onLoad(applyChecklistTemplate(template))
    }))
  }

  const handleDelete = useCallback(
    (id: string) => {
      deleteTemplate.mutate(id, {
        onError: () => {
          showError(t('habits.form.deleteTemplateError'))
        },
      })
    },
    [deleteTemplate, showError, t],
  )

  return (
    <>
      <div className="pt-2">
        <ListRow
          icon="template"
          title={t('habits.form.useTemplate')}
          compact
          placement="column"
          onClick={() => setOpen(true)}
        />
      </div>
      {open ? (
        <Sheet ref={sheetRef} open title={t('habits.form.templates')} onClose={!createTemplate.isPending && dismiss.canDismiss ? finishClose : undefined} onAttemptDismiss={() => requestDismiss()}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            {templates.length > 0 && items.length > 0 && !showSave ? (
              <ListRow
                icon="device-floppy"
                title={t('habits.form.saveAsTemplate')}
                chevron={false}
                onClick={() => setShowSave(true)}
              />
            ) : null}
            {showSave ? (
              <div className="flex items-center px-4 py-2" style={{ gap: 8 }}>
          <input
            value={templateName}
            type="text"
            placeholder={t('habits.form.templateNamePlaceholder')}
            className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2 px-3 text-[14px] border-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              }
            }}
          />
          <button
            type="button"
            className="habit-control-motion shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] disabled:opacity-40 hover:bg-[var(--primary-hover)] active:scale-[0.96]"
            style={{
              padding: "var(--orbit-space-8) var(--orbit-space-12)",
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 500,
            }}
            disabled={!templateName.trim() || createTemplate.isPending}
            onClick={handleSave}
            aria-label={t('common.save')}
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            className="habit-control-motion shrink-0 grid size-[var(--touch-min)] place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] active:scale-[0.96]"
            onClick={cancelEditor}
            aria-label={t('common.close')}
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
              </div>
            ) : null}
            {templates.map((template) => (
              <div key={template.id} className="flex min-w-0 flex-col gap-1 px-4 py-2">
                <button type="button" aria-label={template.name} className="orbit-list-row-body min-h-[var(--touch-min)] w-full min-w-0 rounded-[12px] px-2 py-1 text-left text-[17px] font-normal leading-[1.4] text-[var(--fg-1)]" onClick={() => handleLoad(template.id)}>
                  <PersonalText onClampedChange={(clamped) => setClampedTemplates((current) => current[template.id] === clamped ? current : { ...current, [template.id]: clamped })}>{template.name}</PersonalText>
                </button>
                <div className="flex min-w-0 items-center gap-2 px-2 text-sm text-[var(--fg-3)]">
                  <Icon name="template" size={20} />
                  <span className="min-w-0 flex-1">{t('habits.form.templateItemCount', { count: template.items.length })}</span>
                  <PersonalTextDetails iconOnly clamped={clampedTemplates[template.id]}>{template.name}</PersonalTextDetails>
                  <button type="button" aria-label={`${t('common.delete')}: ${template.name}`} className="orbit-list-row-body grid size-[var(--touch-min)] shrink-0 place-items-center rounded-full" onClick={() => handleDelete(template.id)}>
                    <Icon name="trash" size={20} color="var(--status-bad)" />
                  </button>
                </div>
              </div>
            ))}
            {templates.length === 0 && !showSave ? (
              <ChecklistTemplatesEmptyState canSave={items.length > 0} onSave={() => setShowSave(true)} />
            ) : null}
          </div>
          <DiscardChangesSheet open={dismiss.showDiscardDialog} onKeepEditing={dismiss.cancelDismiss} onDiscard={dismiss.confirmDismiss} />
        </Sheet>
      ) : null}
    </>
  )
}

function ChecklistTemplatesEmptyState({ canSave, onSave }: Readonly<{ canSave: boolean; onSave: () => void }>) {
  const t = useTranslations()
  return (
    <div className="flex flex-col items-center py-8 text-center" style={{ gap: 12 }}>
      <p className="max-w-full truncate text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noTemplates')}</p>
      <p className="text-sm text-[var(--fg-3)]">{t('habits.form.noTemplatesDescription')}</p>
      <button type="button" className="chip mt-2" disabled={!canSave} onClick={onSave}>{t('habits.form.saveCurrentList')}</button>
      {!canSave ? <p className="text-xs text-[var(--fg-3)]">{t('habits.form.saveCurrentListDisabled')}</p> : null}
    </div>
  )
}
