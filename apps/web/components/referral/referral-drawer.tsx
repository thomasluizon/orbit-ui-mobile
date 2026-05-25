'use client'

import { useState } from 'react'
import { Clipboard, Check, Share2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useReferral } from '@/hooks/use-referral'
import { AppOverlay } from '@/components/ui/app-overlay'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { PullQuote } from '@/components/chat/pull-quote'

interface ReferralDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** v8 chrome: hairline-separated rows; mono progress label; AskAstra-style PullQuote for
 *  the how-it-works explanation. */
export function ReferralDrawer({ open, onOpenChange }: Readonly<ReferralDrawerProps>) {
  const t = useTranslations()
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [canShare] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && !!navigator.share,
  )

  const [previousOpen, setPreviousOpen] = useState(open)
  if (previousOpen !== open) {
    setPreviousOpen(open)
    if (open) setCopied(false)
  }

  const discountPercent = stats?.discountPercent ?? 10

  async function copyLink() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: user can manually select text
    }
  }

  async function shareLink() {
    if (!referralUrl || !navigator.share) return
    try {
      await navigator.share({
        title: t('referral.share.title'),
        text: t('referral.share.text', { discount: discountPercent }),
        url: referralUrl,
      })
    } catch {
      // User cancelled share
    }
  }

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('referral.drawer.title')}>
      <div className="-mx-6">
        {/* Loading state */}
        {isLoading && (
          <div style={{ padding: '16px 20px' }}>
            <div
              className="animate-pulse rounded"
              style={{ height: 14, width: 160, background: 'var(--bg-elev)' }}
            />
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div role="alert" style={{ padding: '12px 20px' }}>
            <p
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--status-overdue)',
              }}
            >
              {error?.message ?? t('errors.loadReferral')}
            </p>
          </div>
        )}

        {/* Loaded state */}
        {!isLoading && !isError && (
          <>
            <SectionLabel>{t('referral.drawer.yourLink')}</SectionLabel>
            <div
              className="flex items-center"
              style={{
                padding: '12px 20px',
                gap: 8,
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <div
                aria-label={t('referral.drawer.yourLink')}
                className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 13,
                  color: 'var(--fg-1)',
                }}
              >
                {referralUrl}
              </div>
              <button
                type="button"
                className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center transition-opacity duration-150 ease-out hover:opacity-80"
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--fg-1)',
                  padding: 6,
                  gap: 6,
                }}
                onClick={copyLink}
              >
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                <span>
                  {copied ? t('referral.drawer.copied') : t('referral.drawer.copy')}
                </span>
              </button>
            </div>

            {canShare && (
              <button
                type="button"
                className="w-full appearance-none border-0 bg-transparent cursor-pointer flex items-center justify-center transition-[background-color] duration-150 ease-out hover:bg-[var(--bg-elev)]"
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--hairline)',
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--fg-1)',
                  gap: 8,
                }}
                onClick={shareLink}
              >
                <Share2 size={14} />
                {t('referral.drawer.share')}
              </button>
            )}

            {stats && (
              <>
                <SettingsRow
                  label={t('referral.drawer.completed')}
                  mono
                  accessory="none"
                  value={`${stats.successfulReferrals} / ${stats.maxReferrals}`}
                  valueColor="var(--fg-1)"
                />
                {stats.pendingReferrals > 0 && (
                  <SettingsRow
                    label={t('referral.drawer.pending')}
                    mono
                    accessory="none"
                    value={stats.pendingReferrals}
                    valueColor="var(--fg-1)"
                  />
                )}
                {stats.successfulReferrals > 0 && (
                  <SettingsRow
                    label={t('referral.drawer.couponsEarned')}
                    mono
                    accessory="none"
                    value={stats.successfulReferrals}
                    valueColor="var(--fg-1)"
                  />
                )}
                <div
                  style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid var(--hairline)',
                  }}
                >
                  <div
                    className="relative rounded-full"
                    style={{ height: 3, background: 'var(--bg-sunk)' }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded-full"
                      style={{
                        width: `${Math.min((stats.successfulReferrals / stats.maxReferrals) * 100, 100)}%`,
                        background: 'var(--primary)',
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <PullQuote
              eyebrow={
                <>
                  <Sparkles size={12} strokeWidth={1.7} color="var(--primary)" />
                  <span>{t('referral.drawer.howItWorks')}</span>
                </>
              }
            >
              {t('referral.drawer.explanation', { discount: discountPercent })}
            </PullQuote>

            <p
              style={{
                padding: '4px 20px 20px',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 11,
                color: 'var(--fg-3)',
                lineHeight: 1.5,
              }}
            >
              {t('referral.drawer.disclaimer', { discount: discountPercent })}
            </p>
          </>
        )}
      </div>
    </AppOverlay>
  )
}
