'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'

interface DescriptionViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
}

/**
 * Minimal Markdown-like rendering: bold, italic, headers, line breaks.
 * For full Markdown, install `marked` and `dompurify` packages.
 */
function renderSimpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

export function DescriptionViewer({
  open,
  onOpenChange,
  title,
  description,
}: DescriptionViewerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const renderedHtml = useMemo(() => {
    if (!description) return ''
    return renderSimpleMarkdown(description)
  }, [description])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-border-muted shrink-0">
        <button
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
