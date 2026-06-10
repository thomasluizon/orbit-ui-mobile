'use client'

import { useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface UpdatePromptProps {
  show: boolean
  onUpdate: () => void
  onDismiss: () => void
  currentVersion?: string
  nextVersion?: string
}

export function UpdatePrompt({
  show,
  onUpdate,
  onDismiss,
  currentVersion,
  nextVersion,
}: Readonly<UpdatePromptProps>) {
  const t = useTranslations()
  const [visible, setVisible] = useState(show)

  const handleDismiss = useCallback(() => {
    setVisible(false)
    onDismiss()
  }, [onDismiss])

  if (!show || !visible) return null

  const versionLabel = nextVersion ? t('updatePrompt.title', { version: nextVersion }) : t('updatePrompt.eyebrow')
  const versionDiff =
    currentVersion && nextVersion
      ? t('updatePrompt.version', { previous: currentVersion, next: nextVersion })
      : ''

  return (
    <div
      role="dialog"
      aria-label={versionLabel}
      className="fixed left-0 right-0 z-50 mx-auto"
      style={{
        bottom: 0,
        maxWidth: 'var(--app-max-w)',
      }}
    >
      <div
        className="flex flex-col"
        style={{
          padding: '14px 22px 22px',
          background: 'var(--bg-elev)',
          borderTop: '1px solid var(--hairline)',
          gap: 10,
        }}
      >
        <div className="flex items-center justify-between">
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--fg-3)',
            }}
          >
            {t('updatePrompt.eyebrow')}
          </span>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{ padding: 0, color: 'var(--fg-3)' }}
            aria-label={t('common.dismiss')}
            onClick={handleDismiss}
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--fg-1)',
            letterSpacing: '-0.015em',
          }}
        >
          {versionLabel}
        </div>
        {versionDiff && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--fg-3)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {versionDiff}
          </div>
        )}
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontStyle: 'italic',
            color: 'var(--fg-2)',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {t('updatePrompt.description')}
        </p>
        <div className="flex flex-col" style={{ gap: 8, paddingTop: 8 }}>
          <button
            type="button"
            className="appearance-none border-0 cursor-pointer"
            onClick={onUpdate}
            style={{
              padding: '12px 18px',
              background: 'var(--primary)',
              color: 'var(--fg-on-primary)',
              borderRadius: 10,
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t('updatePrompt.update')}
          </button>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer text-center"
            onClick={handleDismiss}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              padding: 6,
            }}
          >
            {t('updatePrompt.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
