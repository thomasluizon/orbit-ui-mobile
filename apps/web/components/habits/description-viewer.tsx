'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface DescriptionViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
}

export function DescriptionViewer({
  open,
  onOpenChange,
  title,
  description,
}: DescriptionViewerProps) {
  const t = useTranslations()
  const [mounted, setMounted] = useState(false)
  const [renderedHtml, setRenderedHtml] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open || !description) {
      setRenderedHtml('')
      return
    }
    const raw = marked.parse(description, { async: false }) as string
    setRenderedHtml(DOMPurify.sanitize(raw))
  }, [open, description])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-border-muted shrink-0">
        <button
          aria-label={t('common.back')}
          className="size-9 rounded-full bg-surface-elevated flex items-center justify-center text-text-secondary hover:text-text-primary transition-all duration-150"
          onClick={() => onOpenChange(false)}
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="font-bold text-lg text-text-primary truncate">{title}</h1>
      </div>

      {/* Markdown content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div
          className="prose-orbit"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    </div>,
    document.body,
  )
}
