'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  isRecapShareEmpty,
  RECAP_SHARE_PERIODS,
  recapPeriodLabelKey,
  type RecapSharePeriod,
} from '@orbit/shared/utils'
import { useRecap } from '@/hooks/use-recap'
import { useShareCard } from '@/hooks/use-share-card'
import { Sheet } from '@/components/ui/sheet'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { ShareCard } from './share-card'

interface ShareCardPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  displayName?: string
}

/** Recap share preview: period selector → recap fetch → branded ShareCard + share/download. Reused by Profile + Retrospective. */
export function ShareCardPanel({ open, onOpenChange, displayName }: Readonly<ShareCardPanelProps>) {
  const t = useTranslations()
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { data: recap, isLoading, isError, refetch } = useRecap(period, open)
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
    open ? (<Sheet open onClose={() => (onOpenChange)(false)} title={t('shareCard.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 4 }}>
        <div
          className="flex items-center [justify-content:safe_center]"
          style={{ gap: 4, overflowX: 'auto' }}
        >
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
          <div className="flex flex-col items-center" style={{ gap: 12 }} aria-hidden="true">
            <div
              className="skeleton-pulse w-full rounded-[20px]"
              style={{ maxWidth: 360, height: 430, background: 'var(--bg-elev-2)' }}
            />
            <div
              className="skeleton-pulse w-full rounded-full"
              style={{ maxWidth: 360, height: 54, background: 'var(--bg-elev-2)' }}
            />
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex flex-col items-center" style={{ gap: 12, padding: '24px 0' }}>
            <p role="alert" style={{ margin: 0, textAlign: 'center', fontSize: 14, color: 'var(--status-bad)' }}>
              {t('shareCard.error')}
            </p>
            <PillButton variant="ghost" onClick={() => void refetch()}>
              {t('common.retry')}
            </PillButton>
          </div>
        )}

        {!isLoading && !isError && recap && isEmpty && (
          <div className="flex flex-col items-center" style={{ gap: 12, padding: '24px 0' }}>
            <SatelliteGlyph />
            <p style={{ margin: 0, textAlign: 'center', fontSize: 14, color: 'var(--fg-3)' }}>
              {t('shareCard.empty')}
            </p>
          </div>
        )}

          {showCard && (
            <div
              className="flex flex-col"
              style={{ gap: 16 }}
            >
              <div className="flex justify-center">
                <ShareCard ref={captureRef} recap={recap} displayName={displayName} />
              </div>

              {hasError && (
                <p role="alert" style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--status-bad)' }}>
                  {t('shareCard.shareError')}
                </p>
              )}

              <div className="flex w-full" style={{ gap: 8, maxWidth: 360, marginInline: 'auto' }}>
                {canShareFiles && (
                  <PillButton

                    loading={isSharing}
                    disabled={isSharing}
                    onClick={handleShare}

                  >
                    {t('shareCard.share')}
                  </PillButton>
                )}
                <PillButton

                  variant={canShareFiles ? 'ghost' : 'primary'}
                  loading={isSharing}
                  disabled={isSharing}
                  onClick={() => void download()}

                >
                  {t('shareCard.download')}
                </PillButton>
              </div>
            </div>
          )}
      </div>
    </Sheet>) : null
  )
}
