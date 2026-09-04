'use client'

import { useCallback, useState } from 'react'
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
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'

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

  const handleLoad = useCallback(
    (id: string) => {
      const tmpl = templates.find((entry) => entry.id === id)
      if (tmpl) {
        onLoad(applyChecklistTemplate(tmpl))
        setOpen(false)
      }
    },
    [onLoad, templates],
  )

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
      <ListRow
        inset={false}
        icon="template"
        title={t('habits.form.templates')}
        value={templates.length > 0 ? String(templates.length) : undefined}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <Sheet open title={t('habits.form.templates')} onClose={() => setOpen(false)}>
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
            className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2 px-3 text-[13px] border-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
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
            className="shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] disabled:opacity-40 hover:bg-[var(--primary-hover)] transition-[background-color,opacity] duration-150"
            style={{
              padding: '8px 12px',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
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
            className="shrink-0 grid size-10 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors duration-150"
            onClick={() => setShowSave(false)}
            aria-label={t('common.close')}
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
              </div>
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
            {templates.length === 0 && !showSave ? (
              <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}>
                <p className="text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noTemplates')}</p>
                <p className="text-sm text-[var(--fg-3)]">{t('habits.form.noTemplatesDescription')}</p>
                <button type="button" className="chip mt-2" disabled={items.length === 0} onClick={() => setShowSave(true)}>{t('habits.form.saveCurrentList')}</button>
                {items.length === 0 ? <p className="text-xs text-[var(--fg-3)]">{t('habits.form.saveCurrentListDisabled')}</p> : null}
              </div>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  )
}
