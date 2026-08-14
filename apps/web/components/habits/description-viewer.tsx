'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Markdown } from '@/components/ui/markdown'

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
}: Readonly<DescriptionViewerProps>) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCopied(false)
      setCopyFailed(false)
    }
    onOpenChange(nextOpen)
  }

  function copyDescription() {
    setCopyFailed(false)
    void navigator.clipboard
      .writeText(description)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        setCopied(false)
        setCopyFailed(true)
      })
  }

  return (
    <AppOverlay open={open} onOpenChange={handleOpenChange} title={title}>
      <div className="flex items-center justify-end gap-2" style={{ paddingBottom: 10 }}>
        {copyFailed ? (
          <p role="alert" className="text-xs text-[var(--status-bad-text)]">
            {t('habits.detail.copyFailed')}
          </p>
        ) : null}
        <button
          type="button"
          aria-label={t('habits.detail.copyDescription')}
          className="icon-btn icon-btn-well"
          style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
          onClick={copyDescription}
        >
          {copied ? (
            <Check size={18} strokeWidth={1.8} style={{ color: 'var(--status-done)' }} />
          ) : (
            <Copy size={18} strokeWidth={1.8} style={{ color: 'var(--fg-2)' }} />
          )}
        </button>
      </div>
      <div
        className="min-w-0 rounded-[18px] bg-[var(--bg-card)]"
        style={{
          padding: '18px 20px',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <Markdown content={description} />
      </div>
    </AppOverlay>
  )
}
