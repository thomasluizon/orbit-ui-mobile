'use client'

import { useState } from 'react'
import { Check, Copy, Loader2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { ReferralStats } from '@orbit/shared/types/referral'
import { useReferral } from '@/hooks/use-referral'
import { ErrorState } from '@/components/ui/error-state'
import { InfoCard } from '@/components/ui/info-card'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { Sheet } from '@/components/ui/sheet'

interface ReferralDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface LoadedContentProps {
  stats: ReferralStats | null
  referralUrl: string
  copied: boolean
  interactionError: boolean
  canShare: boolean
  onCopy: () => void
  onShare: () => void
}

function LoadedContent({
  stats,
  referralUrl,
  copied,
  interactionError,
  canShare,
  onCopy,
  onShare,
}: Readonly<LoadedContentProps>) {
  const t = useTranslations()
  const progress = stats && stats.maxReferrals > 0
    ? stats.successfulReferrals / stats.maxReferrals
    : 0

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <SectionLabel>{t('referral.drawer.yourLink')}</SectionLabel>
        <div className="px-4">
          <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-field)] py-1 pl-4 pr-2 shadow-[inset_0_0_0_1px_var(--hairline)]">
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-base font-medium tabular-nums text-[var(--fg-1)]">
              {referralUrl}
            </span>
            <button
              type="button"
              className="icon-btn touch-target shrink-0"
              onClick={onCopy}
              aria-label={t('referral.drawer.copyLink')}
            >
              {copied ? (
                <Check size={20} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
              ) : (
                <Copy size={20} strokeWidth={1.8} color="var(--fg-2)" aria-hidden="true" />
              )}
            </button>
            <span aria-live="polite" className="sr-only">
              {copied ? t('referral.drawer.linkCopied') : ''}
            </span>
          </div>
        </div>
      </div>

      {canShare ? (
        <div className="px-4 sm:flex sm:justify-center">
          <PillButton onClick={onShare}>
            {t('referral.drawer.share')}
          </PillButton>
        </div>
      ) : null}

      {interactionError ? (
        <p role="alert" className="px-4 text-sm text-[var(--fg-2)]">
          {t('referral.drawer.actionFailed')}
        </p>
      ) : null}

      {stats ? (
        <div>
          <ListRow
            title={t('referral.drawer.completed')}
            value={`${stats.successfulReferrals} / ${stats.maxReferrals}`}
            readOnly
          />
          {stats.pendingReferrals > 0 ? (
            <ListRow
              title={t('referral.drawer.pending')}
              value={String(stats.pendingReferrals)}
              readOnly
            />
          ) : null}
          {stats.successfulReferrals > 0 ? (
            <ListRow
              title={t('referral.drawer.couponsEarned')}
              value={String(stats.successfulReferrals)}
              readOnly
            />
          ) : null}
          <div className="px-4 py-3">
            <ProgressBar
              value={progress}
              max={1}
              label={t('referral.drawer.completed')}
            />
          </div>
        </div>
      ) : null}

      {stats ? (
        <>
          <div className="px-4">
            <InfoCard>
              <strong className="block text-[var(--fg-1)]">
                {t('referral.drawer.howItWorks')}
              </strong>
              <p className="mt-2 text-sm text-[var(--fg-2)]">
                {t('referral.drawer.explanation', { discount: stats.discountPercent })}
              </p>
            </InfoCard>
          </div>
          <p className="px-4 text-xs leading-5 text-[var(--fg-3)]">
            {t('referral.drawer.disclaimer', { discount: stats.discountPercent })}
          </p>
        </>
      ) : null}
    </div>
  )
}

function ReferralDrawerContent({
  onOpenChange,
}: Readonly<Pick<ReferralDrawerProps, 'onOpenChange'>>) {
  const t = useTranslations()
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [interactionError, setInteractionError] = useState(false)
  const [canShare] = useState(() =>
    typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  )

  async function copyLink() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setInteractionError(false)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setInteractionError(true)
    }
  }

  async function shareLink() {
    if (!referralUrl || !canShare) return
    try {
      await navigator.share({
        title: t('referral.share.title'),
        text: stats
          ? t('referral.share.text', { discount: stats.discountPercent })
          : undefined,
        url: referralUrl,
      })
      setInteractionError(false)
    } catch (shareError) {
      if (!(shareError instanceof DOMException && shareError.name === 'AbortError')) {
        setInteractionError(true)
      }
    }
  }

  return (
    <Sheet open onClose={() => onOpenChange(false)} title={t('referral.drawer.title')}>
      <div className="overlay-bleed">
        {isLoading ? (
          <output
            aria-label={t('common.loading')}
            className="flex justify-center py-12"
          >
            <Loader2
              className="size-6 animate-spin text-[var(--fg-3)]"
              aria-hidden="true"
            />
          </output>
        ) : null}
        {isError ? <ErrorState message={error.message} /> : null}
        {!isLoading && !isError ? (
          <LoadedContent
            stats={stats}
            referralUrl={referralUrl}
            copied={copied}
            interactionError={interactionError}
            canShare={canShare}
            onCopy={() => void copyLink()}
            onShare={() => void shareLink()}
          />
        ) : null}
      </div>
    </Sheet>
  )
}

/** Referral details and sharing actions in the shared sheet composition. */
export function ReferralDrawer({ open, onOpenChange }: Readonly<ReferralDrawerProps>) {
  return open ? <ReferralDrawerContent onOpenChange={onOpenChange} /> : null
}
