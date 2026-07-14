'use client'

import { useState, useCallback } from 'react'
import { Download, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

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
      // react-doctor-disable-next-line prefer-html-dialog -- intentional non-modal bottom-anchored update prompt with custom fixed positioning + slide-up animation; native <dialog> centering/backdrop semantics would break the layout and steal focus https://github.com/thomasluizon/orbit-ui-mobile/issues/243
      role="dialog"
      aria-label={versionLabel}
      className="fixed left-0 right-0 z-50 mx-auto"
      style={{
        bottom: 0,
        maxWidth: 'var(--app-max-w)',
        animation: 'slide-up-fade 0.28s var(--ease-out) both',
      }}
    >
      <div
        className="flex flex-col rounded-t-[26px]"
        style={{
          padding: '20px 22px calc(20px + var(--safe-bottom))',
          background: 'var(--bg-sheet)',
          boxShadow: 'var(--shadow-3), inset 0 0 0 1px var(--hairline)',
          gap: 10,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="t-eyebrow">{t('updatePrompt.eyebrow')}</span>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer flex items-center justify-center -mr-2"
            style={{ width: 44, height: 44, color: 'var(--fg-3)' }}
            aria-label={t('common.dismiss')}
            onClick={handleDismiss}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {versionLabel}
        </div>
        {versionDiff && <div className="t-meta">{versionDiff}</div>}
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {t('updatePrompt.description')}
        </p>
        <div className="flex flex-col" style={{ gap: 10, paddingTop: 10 }}>
          <PillButton
            fullWidth
            onClick={onUpdate}
            leading={<Download size={18} strokeWidth={1.8} />}
          >
            {t('updatePrompt.update')}
          </PillButton>
          <PillButton variant="ghost" fullWidth onClick={handleDismiss}>
            {t('updatePrompt.later')}
          </PillButton>
        </div>
      </div>
    </div>
  )
}
