'use client'

import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ChecklistItem } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Local storage template management
// ---------------------------------------------------------------------------

interface ChecklistTemplate {
  id: string
  name: string
  items: string[]
}

const STORAGE_KEY = 'orbit-checklist-templates'

function loadTemplates(): ChecklistTemplate[] {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return [] // NOSONAR - SSR guard
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChecklistTemplate[]) : []
  } catch {
    return []
  }
}

function persistTemplates(templates: ChecklistTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChecklistTemplatesProps {
  items: ChecklistItem[]
  onLoad: (items: ChecklistItem[]) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChecklistTemplates({ items, onLoad }: Readonly<ChecklistTemplatesProps>) {
  const t = useTranslations()
  const [templates, setTemplates] = useState<ChecklistTemplate[]>(loadTemplates)
  const [showSave, setShowSave] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const handleSave = useCallback(() => {
    const name = templateName.trim()
    if (!name || items.length === 0) return
    const newTemplate: ChecklistTemplate = {
      id: crypto.randomUUID(),
      name,
      items: items.map((i) => i.text),
    }
    const next = [...templates, newTemplate]
    setTemplates(next)
    persistTemplates(next)
    setTemplateName('')
    setShowSave(false)
  }, [templateName, items, templates])

  const handleLoad = useCallback(
    (id: string) => {
      const tmpl = templates.find((t) => t.id === id)
      if (tmpl) {
        onLoad(tmpl.items.map((text) => ({ text, isChecked: false })))
      }
    },
    [templates, onLoad],
  )

  const handleDelete = useCallback(
    (id: string) => {
      const next = templates.filter((t) => t.id !== id)
      setTemplates(next)
      persistTemplates(next)
    },
    [templates],
  )

  return (
    <div className="space-y-2">
      {/* Template actions */}
      <div className="flex items-center gap-2 flex-wrap">
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
                  >
                    {tmpl.name}
                  </button>
                  <button
                    type="button"
                    aria-label={t('common.delete')}
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

      {/* Save template form */}
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
            disabled={!templateName.trim()}
            onClick={handleSave}
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            className="shrink-0 p-2 text-text-muted hover:text-text-primary transition-all duration-150"
            onClick={() => setShowSave(false)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
