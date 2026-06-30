'use client'

import { useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  isRecapShareEmpty,
  RECAP_SHARE_PERIODS,
  recapPeriodLabelKey,
  type RecapSharePeriod,
} from '@orbit/shared/utils'
import { useRecap } from '@/hooks/use-recap'
import { useShareCard } from '@/hooks/use-share-card'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { ShareCard } from './share-card'

interface ShareCardSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayName?: string
}

/** Recap share preview: period selector → recap fetch → branded ShareCard + share/download. Reused by Profile + Retrospective. */
export function ShareCardSheet({ open, onOpenChange, displayName }: Readonly<ShareCardSheetProps>) {
  const t = useTranslations()
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { data: recap, isLoading, isError } = useRecap(period, open)
  const { captureRef, isSharing, hasError, canShareFiles, share, download } = useShareCard()

  const isEmpty = recap ? isRecapShareEmpty(recap.metrics) : false
  const showCard = !isLoading && !isError && recap && !isEmpty

  function handleShare() {
    if (!recap) return
    void share({
      shareTitle: t('shareCard.shareTitle'),
      shareText: t('shareCard.shareText'),
      url: recap.shareDeepLink,
    })
  }

  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('shareCard.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 4 }}>
        <div className="flex items-center" style={{ gap: 6, overflowX: 'auto' }}>
          {RECAP_SHARE_PERIODS.map((value) => (
            <Chip
              key={value}
              active={period === value}
              onClick={() => setPeriod(value)}
              ariaLabel={t(recapPeriodLabelKey(value))}
            >
              {t(recapPeriodLabelKey(value))}
            </Chip>
          ))}
        </div>

        {isLoading && (
          <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 14, color: 'var(--fg-3)' }}>
            {t('shareCard.loading')}
          </p>
        )}

        {!isLoading && isError && (
          <p role="alert" style={{ padding: '24px 0', textAlign: 'center', fontSize: 14, color: 'var(--status-bad)' }}>
            {t('shareCard.error')}
          </p>
        )}

        {!isLoading && !isError && recap && isEmpty && (
          <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 14, color: 'var(--fg-3)' }}>
            {t('shareCard.empty')}
          </p>
        )}

        {showCard && (
          <>
            <div className="flex justify-center">
              <ShareCard ref={captureRef} recap={recap} displayName={displayName} />
            </div>

            {hasError && (
              <p role="alert" style={{ textAlign: 'center', fontSize: 13, color: 'var(--status-bad)' }}>
                {t('shareCard.shareError')}
              </p>
            )}

            <div className="flex" style={{ gap: 10 }}>
              {canShareFiles && (
                <PillButton
                  fullWidth
                  busy={isSharing}
                  disabled={isSharing}
                  onClick={handleShare}
                  leading={<Share2 size={18} strokeWidth={1.8} color="var(--fg-on-primary)" />}
                >
                  {t('shareCard.share')}
                </PillButton>
              )}
              <PillButton
                fullWidth
                variant={canShareFiles ? 'ghost' : 'primary'}
                busy={isSharing}
                disabled={isSharing}
                onClick={() => void download()}
                leading={
                  <Download
                    size={18}
                    strokeWidth={1.8}
                    color={canShareFiles ? 'var(--fg-1)' : 'var(--fg-on-primary)'}
                  />
                }
              >
                {t('shareCard.download')}
              </PillButton>
            </div>
          </>
        )}
      </div>
    </AppOverlay>
  )
}
