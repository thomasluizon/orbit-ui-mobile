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
import { DialogActionPair } from '@/components/ui/dialog-action-pair'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

interface ReferralDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface LoadedContentProps {
  stats: ReferralStats | null
  referralUrl: string
  copied: boolean
  copyFailed: boolean
  onCopy: () => void
}

function LoadedContent({
  stats,
  referralUrl,
  copied,
  copyFailed,
  onCopy,
}: Readonly<LoadedContentProps>) {
  const t = useTranslations()
  const progress = stats && stats.maxReferrals > 0
    ? stats.successfulReferrals / stats.maxReferrals
    : 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>{t('referral.drawer.yourLink')}</SectionLabel>
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

      {copyFailed ? (
        <p role="alert" className="text-sm text-[var(--fg-2)]">
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
          <div className="py-3">
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
          <InfoCard>
            <strong className="block text-[var(--fg-1)]">
              {t('referral.drawer.howItWorks')}
            </strong>
            <p className="mt-2 text-sm text-[var(--fg-2)]">
              {t('referral.drawer.explanation', { discount: stats.discountPercent })}
            </p>
          </InfoCard>
          <p className="text-xs leading-5 text-[var(--fg-3)]">
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
  const { sheetRef, closeSheet } = useSheetHost()
  const t = useTranslations()
  const { stats, referralUrl, isLoading, isError, error } = useReferral()
  const [copied, setCopied] = useState(false)
  const [failedAction, setFailedAction] = useState<'copy' | 'share' | null>(null)
  const [canShare] = useState(() =>
    typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  )
  const isLoaded = !isLoading && !isError

  async function copyLink() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setFailedAction(null)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setFailedAction('copy')
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
      setFailedAction(null)
    } catch {
      setFailedAction('share')
    }
  }

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={() => onOpenChange(false)}
      title={t('referral.drawer.title')}
      actions={
        isLoaded && canShare ? (
            <>
              {failedAction === 'share' ? (
                <p
                  role="alert"
                  className="w-full m-0 text-center text-sm text-[var(--fg-2)]"
                >
                  {t('referral.drawer.actionFailed')}
                </p>
              ) : null}
              <DialogActionPair>
                <PillButton size="sm" variant="ghost" onClick={() => closeSheet()}>{t('common.cancel')}</PillButton>
                <PillButton size="sm" onClick={() => void shareLink()}>
                  {t('referral.drawer.share')}
                </PillButton>
              </DialogActionPair>
            </>
          ) : undefined
      }
    >
      <>
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
        {isLoaded ? (
          <LoadedContent
            stats={stats}
            referralUrl={referralUrl}
            copied={copied}
            copyFailed={failedAction === 'copy'}
            onCopy={() => void copyLink()}
          />
        ) : null}
      </>
    </Sheet>
  )
}

/** Referral details and sharing actions in the shared sheet composition. */
export function ReferralDrawer({ open, onOpenChange }: Readonly<ReferralDrawerProps>) {
  return open ? <ReferralDrawerContent onOpenChange={onOpenChange} /> : null
}
