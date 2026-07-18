'use client'

import { useTranslations } from 'next-intl'
import { AstraMark } from '@/components/ui/astra-avatar'

export function TypingIndicator() {
  const t = useTranslations()

  return (
    <div
      className="animate-msg-in flex items-start"
      style={{ gap: 8, padding: '0 16px', marginBottom: 16 }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        data-slot="ai-avatar"
        className="shrink-0 rounded-full flex items-center justify-center"
        style={{
          width: 30,
          height: 30,
          background: 'rgba(var(--primary-rgb), 0.18)',
        }}
        aria-hidden="true"
      >
        <AstraMark size={16} />
      </div>
      <div>
        <span className="sr-only">{t('chat.senderOrbit')}</span>
        <div
          className="bg-[var(--bg-elev)]"
          style={{ padding: '12px 16px', borderRadius: '4px 18px 18px 18px' }}
        >
          <div className="flex gap-1.5 items-center">
            <span
              className="size-2 bg-[var(--primary)] rounded-full animate-gentle-pulse"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="size-2 bg-[var(--fg-4)] rounded-full animate-gentle-pulse"
              style={{ animationDelay: '200ms' }}
            />
            <span
              className="size-2 bg-[var(--fg-4)] rounded-full animate-gentle-pulse"
              style={{ animationDelay: '400ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
