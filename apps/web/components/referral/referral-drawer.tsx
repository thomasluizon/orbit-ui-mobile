'use client'

import { useState } from 'react'
import { Check, Copy, Gift, Loader2, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useReferral } from '@/hooks/use-referral'
import { AppOverlay } from '@/components/ui/app-overlay'
import { InfoCard } from '@/components/ui/info-card'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'

interface ReferralDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Referral sheet: hero icon disc, mono link well with copy, primary share pill,
 *  progress rows, and a kit InfoCard explainer. */
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
    }
  }

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('referral.drawer.title')}>
      <div className="overlay-bleed">
        {isLoading && (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex justify-center"
            style={{ padding: '40px 0' }}
          >
            <Loader2
              className="size-6 animate-spin"
              style={{ color: 'var(--fg-3)' }}
              aria-hidden="true"
            />
          </div>
        )}

        {isError && (
          <div
            role="alert"
            style={{
              margin: '12px 20px',
              padding: 14,
              borderRadius: 14,
              boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                color: 'var(--status-overdue-text)',
              }}
            >
              {error.message}
            </p>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            <div className="flex justify-center" style={{ padding: '8px 0 4px' }}>
              <span
                aria-hidden="true"
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 64,
                  height: 64,
                  background: 'rgba(var(--primary-rgb), 0.15)',
                }}
              >
                <Gift size={30} strokeWidth={1.8} color="var(--primary-soft)" />
              </span>
            </div>

            <SectionLabel>{t('referral.drawer.yourLink')}</SectionLabel>
            <div style={{ padding: '0 20px 4px' }}>
              <div
                className="flex items-center rounded-[14px]"
                style={{
                  gap: 8,
                  padding: '5px 6px 5px 16px',
                  background: 'var(--bg-field)',
                  boxShadow: 'inset 0 0 0 1px var(--hairline)',
                }}
              >
                <div
                  className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--fg-1)',
                  }}
                >
                  {referralUrl}
                </div>
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  style={{ width: 44, height: 44 }}
                  onClick={() => void copyLink()}
                  aria-label={t('referral.drawer.copyLink')}
                >
                  {copied ? (
                    <Check size={18} strokeWidth={1.8} color="var(--status-done)" aria-hidden="true" />
                  ) : (
                    <Copy size={18} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
                  )}
                </button>
                <span aria-live="polite" className="sr-only">
                  {copied ? t('referral.drawer.linkCopied') : ''}
                </span>
              </div>
            </div>

            {canShare && (
              <div className="sm:flex sm:justify-center" style={{ padding: '10px 20px 6px' }}>
                <PillButton
                  fullWidth
                  leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
                  onClick={() => void shareLink()}
                >
                  {t('referral.drawer.share')}
                </PillButton>
              </div>
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
                    valueColor="var(--status-done)"
                  />
                )}
                <div style={{ padding: '12px 20px' }}>
                  <ProgressBar
                    progress={stats.successfulReferrals / stats.maxReferrals}
                    label={t('referral.drawer.completed')}
                  />
                </div>
              </>
            )}

            <div style={{ padding: '14px 20px 0' }}>
              <InfoCard
                title={t('referral.drawer.howItWorks')}
                desc={t('referral.drawer.explanation', { discount: discountPercent })}
              />
            </div>

            <p
              style={{
                padding: '12px 20px 20px',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
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
