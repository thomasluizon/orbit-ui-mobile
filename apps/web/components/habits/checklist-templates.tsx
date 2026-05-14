'use client'

import { useCallback, useState } from 'react'
import { X } from 'lucide-react'
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
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {items.length > 0 && !showSave && (
          <button
            type="button"
            className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            onClick={() => setShowSave(true)}
          >
            {t('habits.form.saveAsTemplate')}
          </button>
        )}
        {templates.length > 0 && (
          <>
            {items.length > 0 && !showSave && (
              <span className="text-text-muted text-xs">|</span>
            )}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                {t('habits.form.templates')}:
              </span>
              {templates.map((tmpl) => (
                <span
                  key={tmpl.id}
                  className="inline-flex items-center gap-1 rounded-lg text-xs bg-surface border border-border-muted"
                >
                  <button
                    type="button"
                    className="px-2 py-0.5 text-text-secondary hover:text-text-primary transition-all duration-150"
                    onClick={() => handleLoad(tmpl.id)}
                    aria-label={`${t('habits.form.templates')}: ${tmpl.name}`}
                  >
                    {tmpl.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`${t('common.delete')}: ${tmpl.name}`}
                    className="px-1 py-0.5 text-text-muted hover:text-red-500 transition-colors"
                    onClick={() => handleDelete(tmpl.id)}
                  >
                    <X className="size-3" />
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
            className="flex-1 min-w-0 bg-surface text-text-primary placeholder-text-muted rounded-xl py-2 px-3 text-xs border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            className="shrink-0 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 hover:bg-primary/90 transition-all duration-150"
            disabled={!templateName.trim() || createTemplate.isPending}
            onClick={handleSave}
            aria-label={t('common.save')}
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            className="shrink-0 p-2 text-text-muted hover:text-text-primary transition-all duration-150"
            onClick={() => setShowSave(false)}
            aria-label={t('common.close')}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
