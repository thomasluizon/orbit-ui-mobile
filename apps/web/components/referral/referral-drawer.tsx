'use client'

import { useState, useEffect } from 'react'
import { Clipboard, Check, Share2, Sparkles } from 'lucide-react'
import { useReferral } from '@/hooks/use-referral'
import { AppOverlay } from '@/components/ui/app-overlay'

// TODO: Replace with next-intl when i18n is wired up
const t = (key: string, params?: Record<string, string | number>) => {
  const strings: Record<string, string> = {
    'referral.drawer.title': 'Refer a Friend',
    'referral.drawer.yourLink': 'Your referral link',
    'referral.drawer.copy': 'Copy',
    'referral.drawer.copied': 'Copied!',
    'referral.drawer.share': 'Share Link',
    'referral.drawer.completed': 'Completed referrals',
    'referral.drawer.pending': 'Pending',
    'referral.drawer.couponsEarned': 'Coupons earned',
    'referral.drawer.howItWorks': 'How it works',
    'referral.drawer.explanation': `Share your link with friends. When they sign up and subscribe, you both get ${params?.discount ?? 10}% off.`,
    'referral.drawer.disclaimer': `Each successful referral earns a ${params?.discount ?? 10}% discount coupon. Limited to available referral slots.`,
    'referral.share.title': 'Try Orbit',
    'referral.share.text': `Build better habits with Orbit. Sign up and get ${params?.discount ?? 10}% off!`,
  }
  return strings[key] ?? key
}

interface ReferralDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReferralDrawer({ open, onOpenChange }: ReferralDrawerProps) {
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  useEffect(() => {
    if (open) {
      setCopied(false)
    }
  }, [open])

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
      <div className="space-y-5">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-3">
            <div className="h-12 bg-surface-elevated rounded-[var(--radius-lg)] animate-pulse" />
            <div className="h-20 bg-surface-elevated rounded-[var(--radius-lg)] animate-pulse" />
          </div>
        )}

        {/* Error state */}
        {isError && !isLoading && (
          <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-[var(--radius-lg)] p-4">
            <p className="text-sm text-red-400">{error?.message ?? 'Failed to load referral data'}</p>
          </div>
        )}

        {/* Loaded state */}
        {!isLoading && !isError && (
          <>
            {/* Referral link */}
            <div>
              <p id="referral-link-label" className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                {t('referral.drawer.yourLink')}
              </p>
              <div className="flex gap-2">
                <div
                  aria-labelledby="referral-link-label"
                  className="flex-1 bg-surface-elevated rounded-[var(--radius-lg)] px-4 py-3 text-sm text-text-primary font-mono truncate border border-border"
                >
                  {referralUrl}
                </div>
                <button
                  className="shrink-0 bg-primary hover:bg-primary/90 text-white rounded-[var(--radius-lg)] px-4 py-3 transition-all duration-150 flex items-center gap-1.5 shadow-[var(--shadow-glow-sm)]"
                  onClick={copyLink}
                >
                  {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                  <span className="text-sm font-bold">
                    {copied ? t('referral.drawer.copied') : t('referral.drawer.copy')}
                  </span>
                </button>
              </div>
            </div>

            {/* Native share button (mobile) */}
            {canShare && (
              <button
                className="w-full py-3 rounded-[var(--radius-lg)] bg-surface-elevated text-text-primary font-bold text-sm hover:bg-border transition-all duration-150 flex items-center justify-center gap-2"
                onClick={shareLink}
              >
                <Share2 className="size-4" />
                {t('referral.drawer.share')}
              </button>
            )}

            {/* Stats */}
            {stats && (
              <div className="bg-surface-elevated rounded-[var(--radius-lg)] border border-border-muted shadow-[var(--shadow-sm)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">{t('referral.drawer.completed')}</span>
                  <span className="text-sm font-bold text-text-primary">
                    {stats.successfulReferrals} / {stats.maxReferrals}
                  </span>
                </div>
                {stats.pendingReferrals > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{t('referral.drawer.pending')}</span>
                    <span className="text-sm font-bold text-amber-400">{stats.pendingReferrals}</span>
                  </div>
                )}
                {stats.successfulReferrals > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{t('referral.drawer.couponsEarned')}</span>
                    <span className="text-sm font-bold text-emerald-400">{stats.successfulReferrals}</span>
                  </div>
                )}
                {/* Progress bar */}
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((stats.successfulReferrals / stats.maxReferrals) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Explanation */}
            <div className="bg-primary/5 border border-primary/10 rounded-[var(--radius-lg)] p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-text-primary mb-1">{t('referral.drawer.howItWorks')}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {t('referral.drawer.explanation', { discount: discountPercent })}
                  </p>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[10px] text-text-muted leading-relaxed">
              {t('referral.drawer.disclaimer', { discount: discountPercent })}
            </p>
          </>
        )}
      </div>
    </AppOverlay>
  )
}
