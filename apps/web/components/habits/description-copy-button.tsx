'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy } from '@/components/ui/icons'

export function DescriptionCopyButton({ description }: Readonly<{ description: string }>) {
  const t = useTranslations()
  const errorId = useId()
  const [status, setStatus] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle')
  const disabled = !description.trim() || status === 'pending'

  async function copyDescription() {
    if (disabled) return
    setStatus('pending')
    try {
      await navigator.clipboard.writeText(description)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <button
        type="button"
        aria-label={t('habits.detail.copyDescription')}
        aria-busy={status === 'pending'}
        aria-describedby={status === 'error' ? errorId : undefined}
        disabled={disabled}
        className="icon-btn icon-btn-well motion-reduce:transform-none disabled:transform-none disabled:opacity-40"
        onClick={() => { void copyDescription() }}
      >
        {status === 'copied' ? <Check size={20} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={20} strokeWidth={1.5} aria-hidden="true" />}
      </button>
      <p role="status" className="text-sm text-[var(--fg-2)]">{status === 'copied' ? t('habits.detail.descriptionCopied') : ''}</p>
      {status === 'error' ? <p id={errorId} role="alert" className="max-w-prose text-sm text-[var(--status-bad-text)]">{t('habits.detail.copyFailed')}</p> : null}
    </div>
  )
}
