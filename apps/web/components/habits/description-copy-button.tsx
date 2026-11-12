'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CopyStateIcon } from '@/components/ui/copy-state-icon'
import { useAccountGeneration } from '@/hooks/use-session-reset'

export function DescriptionCopyButton({ description }: Readonly<{ description: string }>) {
  const accountGeneration = useAccountGeneration()
  return <DescriptionCopyAction key={`${accountGeneration}:${description}`} description={description} />
}

function DescriptionCopyAction({ description }: Readonly<{ description: string }>) {
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
        className="icon-btn icon-btn-well enabled:hover:bg-[var(--bg-elev-hover)] enabled:active:bg-[var(--bg-elev-hover)] disabled:transform-none disabled:opacity-40"
        onClick={() => { void copyDescription() }}
      >
        <CopyStateIcon copied={status === 'copied'} strokeWidth={1.5} />
      </button>
      <p id={errorId} role="status" className={status === 'error' ? 'max-w-prose text-sm text-[var(--status-bad-text)]' : 'sr-only'}>{status === 'error' ? t('habits.detail.copyFailed') : status === 'copied' ? t('habits.detail.descriptionCopied') : ''}</p>
    </div>
  )
}
