'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy, Share2 } from 'lucide-react'
import { PillButton } from '@/components/ui/pill-button'
import { ShareCardQr } from '@/components/share/share-card-qr'
import { useReferral } from '@/hooks/use-referral'

/** Invite-link hero on the add-friend surface: the user's referral link with a QR, copy, and
 *  (where supported) native share — a low-friction way to pull a friend into Orbit. */
export function InviteHero() {
  const t = useTranslations()
  const { referralUrl } = useReferral()
  const [copied, setCopied] = useState(false)

  if (!referralUrl) return null

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function shareLink() {
    try {
      await navigator.share({
        title: t('social.invite.title'),
        text: t('social.invite.shareText'),
        url: referralUrl,
      })
    } catch {}
  }

  return (
    <div
      className="flex flex-col items-center text-center"
      style={{
        borderRadius: 18,
        background: 'var(--bg-elev)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        padding: '20px 18px',
        gap: 14,
      }}
    >
      <div className="flex flex-col" style={{ gap: 4 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 18, fontWeight: 600, color: 'var(--fg-1)' }}>
          {t('social.invite.title')}
        </h3>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-3)' }}>
          {t('social.invite.subtitle')}
        </p>
      </div>

      <div style={{ borderRadius: 16, background: '#ffffff', padding: 10, lineHeight: 0 }}>
        <ShareCardQr value={referralUrl} size={128} />
      </div>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg-4)' }}>
        {t('social.invite.scanHint')}
      </span>

      <div
        className="flex w-full items-center"
        style={{
          gap: 8,
          borderRadius: 14,
          background: 'var(--bg-sunk)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          padding: '4px 6px 4px 16px',
        }}
      >
        <span
          className="flex-1 min-w-0 truncate text-left"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--fg-2)' }}
        >
          {referralUrl}
        </span>
        <button
          type="button"
          onClick={() => void copyLink()}
          aria-label={copied ? t('social.invite.copied') : t('social.invite.copy')}
          className="relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 transition-transform active:scale-[0.96]"
          style={{
            width: 44,
            height: 44,
            background: 'var(--bg-elev)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            color: 'var(--fg-2)',
          }}
        >
          <Copy
            size={18}
            strokeWidth={1.8}
            aria-hidden="true"
            className="absolute transition-opacity duration-[var(--dur-fast)]"
            style={{ opacity: copied ? 0 : 1 }}
          />
          <Check
            size={18}
            strokeWidth={1.8}
            color="var(--status-done)"
            aria-hidden="true"
            className="absolute transition-opacity duration-[var(--dur-fast)]"
            style={{ opacity: copied ? 1 : 0 }}
          />
        </button>
      </div>

      {canShare ? (
        <PillButton onClick={() => void shareLink()} leading={<Share2 size={18} strokeWidth={1.8} />}>
          {t('social.invite.share')}
        </PillButton>
      ) : null}
    </div>
  )
}
