'use client'

import { useState, useCallback } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface UpdatePromptProps {
  show: boolean
  onUpdate: () => void
  onDismiss: () => void
}

export function UpdatePrompt({ show, onUpdate, onDismiss }: UpdatePromptProps) {
  const t = useTranslations()
  const [visible, setVisible] = useState(show)

  const handleDismiss = useCallback(() => {
    setVisible(false)
    onDismiss()
  }, [onDismiss])

  const handleUpdate = useCallback(() => {
    onUpdate()
  }, [onUpdate])

  if (!show || !visible) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-[var(--app-max-w)] animate-[slide-up-fade_300ms_ease-out]">
      <div className="bg-surface-overlay border border-border-muted rounded-lg p-4 shadow-[var(--shadow-lg)] backdrop-blur-sm flex items-start gap-3">
        <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center">
          <RefreshCw className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">{t('updatePrompt.title')}</p>
          <p className="text-xs text-text-secondary mt-0.5">{t('updatePrompt.description')}</p>
          <div className="flex gap-2 mt-3">
            <button
              className="px-4 py-2 rounded-full bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all active:scale-95"
              onClick={handleUpdate}
            >
              {t('updatePrompt.update')}
            </button>
            <button
              className="px-4 py-2 rounded-full text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              onClick={handleDismiss}
            >
              {t('updatePrompt.later')}
            </button>
          </div>
        </div>
        <button className="shrink-0 p-1 text-text-muted hover:text-text-primary" onClick={handleDismiss}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
