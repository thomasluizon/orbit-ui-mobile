'use client'

import type { InlineLoadErrorProps } from '@orbit/shared/contracts/feedback'
import { useTranslations } from 'next-intl'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'

/** A load failure stated in the caller's words, with a retry glyph on the message column. */
export function InlineLoadError({ message, onRetry }: Readonly<InlineLoadErrorProps>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-start">
      <p
        role="alert"
        className="text-sm leading-5 text-[var(--status-bad-text)]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {message}
      </p>
      <IconButton edge="start" label={t('common.retry')} onClick={onRetry}>
        <RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" />
      </IconButton>
    </div>
  )
}
