'use client'

import { useCallback, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { applyChecklistTemplate } from '@orbit/shared/utils'
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} from '@/hooks/use-checklist-templates'
import { useAppToast } from '@/hooks/use-app-toast'

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
      if (tmpl) onLoad(applyChecklistTemplate(tmpl))
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        {items.length > 0 && !showSave && (
          <button
            type="button"
            className="chip"
            onClick={() => setShowSave(true)}
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            {t('habits.form.saveAsTemplate')}
          </button>
        )}
        {templates.length > 0 && (
          <>
            {items.length > 0 && !showSave && (
              <span aria-hidden="true" className="self-stretch w-px bg-[var(--hairline)]" />
            )}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span
                className="uppercase text-[var(--fg-3)]"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                }}
              >
                {t('habits.form.templates')}:
              </span>
              {templates.map((tmpl) => (
                <span
                  key={tmpl.id}
                  className="inline-flex items-center rounded-full bg-[var(--bg-elev)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-[background-color] duration-[var(--dur-fast)] hover:bg-[var(--bg-elev-2)]"
                  style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500 }}
                >
                  <button
                    type="button"
                    className="pl-3.5 pr-1.5 py-2 text-[var(--fg-2)] hover:text-[var(--fg-1)] transition-colors duration-150"
                    onClick={() => handleLoad(tmpl.id)}
                    aria-label={`${t('habits.form.templates')}: ${tmpl.name}`}
                  >
                    {tmpl.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`${t('common.delete')}: ${tmpl.name}`}
                    className="pl-0.5 pr-3 py-2 text-[var(--fg-3)] hover:text-[var(--status-bad)] transition-colors disabled:opacity-50"
                    onClick={() => handleDelete(tmpl.id)}
                    disabled={deleteTemplate.isPending && deleteTemplate.variables === tmpl.id}
                  >
                    <X size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {showSave && (
        <div className="flex items-center gap-2">
          <input
            value={templateName}
            type="text"
            placeholder={t('habits.form.templateNamePlaceholder')}
            className="flex-1 min-w-0 bg-[var(--bg-field)] text-[var(--fg-1)] placeholder:text-[var(--fg-3)] rounded-[12px] py-2.5 px-3.5 text-[13px] border-0 shadow-[inset_0_0_0_1px_var(--hairline)] focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)] transition-[box-shadow] duration-[var(--dur-fast)]"
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
            className="shrink-0 rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] disabled:opacity-40 hover:bg-[var(--primary-pressed)] transition-[background-color,opacity] duration-150"
            style={{
              padding: '9px 14px',
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
      )}
    </div>
  )
}
