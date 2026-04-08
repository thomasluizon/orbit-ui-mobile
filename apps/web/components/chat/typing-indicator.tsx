'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function TypingIndicator() {
  const t = useTranslations()

  return (
    <div className="flex gap-3 items-end" role="status" aria-live="polite" aria-atomic="true">
      {/* AI avatar */}
      <div className="shrink-0 size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center" aria-hidden="true">
        <Sparkles className="size-5 text-primary" />
      </div>
      <div>
        <span className="text-[11px] font-medium text-text-secondary mb-1 px-2 block">
          {t('chat.senderOrbit')}
        </span>
        <div className="bg-surface-elevated rounded-tl-[var(--radius-lg)] rounded-tr-[var(--radius-lg)] rounded-br-[var(--radius-lg)] px-4 py-3 border border-border-muted shadow-[var(--shadow-sm)]">
          <div className="flex gap-1.5 items-center">
            <span
              className="size-2 bg-text-secondary rounded-full animate-gentle-pulse"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="size-2 bg-text-secondary rounded-full animate-gentle-pulse"
              style={{ animationDelay: '200ms' }}
            />
            <span
              className="size-2 bg-text-secondary rounded-full animate-gentle-pulse"
              style={{ animationDelay: '400ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
