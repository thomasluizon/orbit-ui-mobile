'use client'

import { useState } from 'react'
import { Check, Clipboard, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

interface ShareJoinCodeProps {
  title: string
  joinCode: string
}

/** Join-code well with copy plus native text share (Web Share API, clipboard fallback, no image capture). */
export function ShareJoinCode({ title, joinCode }: Readonly<ShareJoinCodeProps>) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const shareText = t('challenges.share.text', { title, code: joinCode })
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
    }
  }

  async function shareCode() {
    if (!('share' in navigator)) {
      await copyCode()
      return
    }
    try {
      await navigator.share({ title: t('challenges.share.title'), text: shareText })
    } catch {
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div
        className="flex items-center rounded-[14px]"
        style={{
          gap: 8,
          padding: '4px 6px 4px 16px',
          background: 'var(--bg-field)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div
          aria-label={t('challenges.join.codeLabel')}
          className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 16, letterSpacing: '0.08em', color: 'var(--fg-1)' }}
        >
          {joinCode}
        </div>
        <button
          type="button"
          aria-label={copied ? t('challenges.detail.copied') : t('challenges.detail.copy')}
          onClick={() => void copyCode()}
          className="icon-btn icon-btn-well shrink-0"
        >
          <span
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none ${
              copied ? 'scale-[0.25] opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            <Clipboard size={18} strokeWidth={1.8} />
          </span>
          <span
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] motion-reduce:transition-none ${
              copied ? 'scale-100 opacity-100' : 'scale-[0.25] opacity-0'
            }`}
            style={{ color: 'var(--status-done)' }}
          >
            <Check size={18} strokeWidth={1.8} />
          </span>
        </button>
      </div>

      {canShare ? (
        <PillButton
          fullWidth
          leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
          onClick={() => void shareCode()}
        >
          {t('challenges.detail.share')}
        </PillButton>
      ) : null}
    </div>
  )
}
