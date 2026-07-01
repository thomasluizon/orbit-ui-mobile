'use client'

import { useState } from 'react'
import { Check, Clipboard, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'

interface ShareJoinCodeProps {
  title: string
  joinCode: string
}

/** Join-code well with copy plus native text share (Web Share API, clipboard fallback — no image capture). */
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
    if (!navigator.share) {
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
        <button type="button" className="chip" onClick={copyCode}>
          {copied ? (
            <Check size={14} strokeWidth={1.8} color="var(--status-done)" aria-hidden="true" />
          ) : (
            <Clipboard size={14} strokeWidth={1.8} aria-hidden="true" />
          )}
          <span>{copied ? t('challenges.detail.copied') : t('challenges.detail.copy')}</span>
        </button>
      </div>

      {canShare ? (
        <PillButton
          fullWidth
          leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
          onClick={shareCode}
        >
          {t('challenges.detail.share')}
        </PillButton>
      ) : null}
    </div>
  )
}
