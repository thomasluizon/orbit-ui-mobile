'use client'

import { useState } from 'react'
import { Clipboard, Check, Share2, Gift } from 'lucide-react'
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
      <div className="-mx-6">
        {isLoading && (
          <div style={{ padding: '16px 20px' }}>
            <div
              className="animate-pulse rounded"
              style={{ height: 14, width: 160, background: 'var(--bg-elev)' }}
            />
          </div>
        )}

        {isError && !isLoading && (
          <div role="alert" style={{ padding: '12px 20px' }}>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--status-overdue)',
              }}
            >
              {error?.message ?? t('errors.loadReferral')}
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
                  padding: '4px 6px 4px 16px',
                  background: 'var(--bg-field)',
                  boxShadow: 'inset 0 0 0 1px var(--hairline)',
                }}
              >
                <div
                  aria-label={t('referral.drawer.yourLink')}
                  className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--fg-1)',
                  }}
                >
                  {referralUrl}
                </div>
                <button
                  type="button"
                  className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-80"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--fg-1)',
                    minHeight: 44,
                    padding: '0 10px',
                    gap: 6,
                  }}
                  onClick={copyLink}
                >
                  {copied ? <Check size={14} strokeWidth={1.8} /> : <Clipboard size={14} strokeWidth={1.8} />}
                  <span>
                    {copied ? t('referral.drawer.copied') : t('referral.drawer.copy')}
                  </span>
                </button>
              </div>
            </div>

            {canShare && (
              <div style={{ padding: '10px 20px 6px' }}>
                <PillButton
                  fullWidth
                  leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
                  onClick={shareLink}
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
                    valueColor="var(--fg-1)"
                  />
                )}
                <div
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--hairline)',
                  }}
                >
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
