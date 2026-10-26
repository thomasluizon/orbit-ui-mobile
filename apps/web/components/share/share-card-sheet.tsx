'use client'

import { IconButton } from '@/components/ui/icon-button'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { isRecapShareEmpty, type RecapSharePeriod } from '@orbit/shared/utils'
import { useWrapped } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { useReferralInvitation } from '@/hooks/use-referral-invitation'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'

import { Download, Share2, RefreshCw } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ShareCard } from './share-card'

interface ShareCardSheetProps {
  onClose: () => void
}

function ShareCardFeedback({ hasError, savedFileName }: Readonly<{ hasError: boolean; savedFileName: string | null }>) {
  const t = useTranslations()
  return (
    <div className={hasError || savedFileName ? 'pt-section-gap' : undefined}>
      <p role="alert" className="text-base text-[var(--status-bad-text)]">{hasError ? t('shareCard.shareError') : ''}</p>
      <p role="status" className="text-sm text-[var(--fg-2)]">{!hasError && savedFileName ? t('shareCard.saved', { file: savedFileName }) : ''}</p>
    </div>
  )
}

export function ShareCardSheet({ onClose }: Readonly<ShareCardSheetProps>) {
  const t = useTranslations()
  const invitation = useReferralInvitation()
  const { sheetRef, closeSheet } = useSheetHost()
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { recap, isLoading, isError, refetch } = useWrapped(period, { enabled: true })
  const { captureRef, isSharing, hasError, savedFileName, canShareFiles, share, download, resetFeedback } = useShareCard()
  const isEmpty = recap ? isRecapShareEmpty(recap.metrics, 0) : false
  const ready = Boolean(recap && !isLoading && !isError && !isEmpty)
  const disabled = !ready || isSharing
  const actions = <>
    <IconButton label={t('shareCard.download')} disabled={disabled} loading={isSharing} onClick={() => void download()}><Download size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
    {canShareFiles ? <IconButton label={t('shareCard.share')} disabled={disabled} loading={isSharing} onClick={() => {
      if (recap) void share({ shareTitle: t('shareCard.shareTitle'), shareText: invitation, url: recap.shareDeepLink })
    }}><Share2 size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton> : null}
  </>

  return (
    <Sheet ref={sheetRef} title={t('shareCard.share')} accessibleTitle={t('shareCard.title')} onAttemptDismiss={() => { resetFeedback(); closeSheet(onClose) }} actions={actions}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-col gap-section-gap">
          <SegmentedControl label={t('wrapped.periodGroup')} value={period} options={[{ value: 'week', label: t('shareCard.periods.week') }, { value: 'month', label: t('shareCard.periods.month') }, { value: 'year', label: t('shareCard.periods.year') }]} disabled={isSharing} onChange={(value) => { resetFeedback(); setPeriod(value) }} fullWidth />
          {isLoading || (!recap && !isError) ? <div role="progressbar" aria-busy="true" aria-label={t('shareCard.loading')} className="flex min-h-[640px] flex-col justify-center gap-section-gap">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" grouped />)}
          </div> : null}
          {isError ? <ErrorState message={t('shareCard.error')} action={<IconButton label={t('common.retry')} onClick={() => void refetch()}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>} /> : null}
          {!isLoading && !isError && isEmpty ? <EmptyState title={t('shareCard.empty')} /> : null}
          {ready && recap ? <ShareCard ref={captureRef} recap={recap} variant="progress" /> : null}
        </div>
        <ShareCardFeedback hasError={hasError} savedFileName={savedFileName} />
      </div>
    </Sheet>
  )
}
