'use client'

import { IconButton } from '@/components/ui/icon-button'

import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { motionDurations, resolveMotionPreset } from '@orbit/shared/theme'
import { isRecapShareEmpty, RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { useFlag } from '@/hooks/use-flag'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { useWrapped } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { useReferralInvitation } from '@/hooks/use-referral-invitation'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'

import { Download, Share2, RefreshCw } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { OptionCard } from '@/components/ui/option-card'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
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

interface SharePeriodControlProps {
  guided: boolean
  period: RecapSharePeriod
  disabled: boolean
  onSelect: (period: RecapSharePeriod) => void
}

/** The period choice. Guided, the three periods are quick options under the sheet heading: the data has only these three, so the choice has no free path. */
function SharePeriodControl({ guided, period, disabled, onSelect }: Readonly<SharePeriodControlProps>) {
  const t = useTranslations()
  const question = t('shareCard.periodQuestion')
  if (!guided) {
    return <div data-share-period-question="" className="flex min-w-0 flex-col gap-2"><span data-field-question="" aria-hidden="true" className="text-sm font-medium text-[var(--fg-2)]">{question}</span><SegmentedControl label={question} value={period} options={[{ value: 'week', label: t('shareCard.periods.week') }, { value: 'month', label: t('shareCard.periods.month') }, { value: 'year', label: t('shareCard.periods.year') }]} disabled={disabled} onChange={onSelect} fullWidth /></div>
  }
  return (
    <div role="group" aria-label={question} data-option-group="" className="grid w-full grid-cols-2 gap-3">
      {RECAP_SHARE_PERIODS.map((value) => (
        <OptionCard key={value} label={t(`shareCard.periods.${value}`)} selected={period === value} disabled={disabled} onSelect={() => onSelect(value)} />
      ))}
    </div>
  )
}

/** A period press brings the new preview in with the selection preset. The first preview and reduced motion have no scale. */
function SharePreviewChange({ period, changed, children }: Readonly<{ period: RecapSharePeriod; changed: boolean; children: ReactNode }>) {
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const preset = resolveMotionPreset('selection', reducedMotion)
  return (
    <motion.div
      key={period}
      data-share-preview=""
      data-preview-duration={changed ? preset.enterDuration : motionDurations.instant}
      data-preview-scale={changed ? preset.scaleFrom : preset.scaleTo}
      initial={changed ? { opacity: 0, scale: preset.scaleFrom } : false}
      animate={{ opacity: 1, scale: preset.scaleTo }}
      transition={{ duration: preset.enterDuration / 1000, ease: [...preset.enterEasing] as [number, number, number, number] }}
    >
      {children}
    </motion.div>
  )
}

/** The load error with retry. Guided, Orbit in Parado states it. */
function ShareLoadError({ guided, onRetry }: Readonly<{ guided: boolean; onRetry: () => void }>) {
  const t = useTranslations()
  const mascotSize = useStateMascotSize()
  const retry = <IconButton label={t('common.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
  if (!guided) return <ErrorState message={t('shareCard.error')} action={retry} />
  return (
    <div role="alert" aria-live="polite" aria-atomic="true" data-share-error="" className="flex flex-col items-center gap-6 px-6 py-12 text-center">
      <span aria-hidden="true"><OrbitMascot size={mascotSize} state="parado" /></span>
      <p className="max-w-[65ch] text-base text-[var(--fg-1)]">{t('shareCard.error')}</p>
      {retry}
    </div>
  )
}

export function ShareCardSheet({ onClose }: Readonly<ShareCardSheetProps>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const [periodChanged, setPeriodChanged] = useState(false)
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

  const selectPeriod = (value: RecapSharePeriod) => {
    resetFeedback()
    setPeriodChanged(true)
    setPeriod(value)
  }
  const card = ready && recap ? <ShareCard ref={captureRef} recap={recap} variant="progress" /> : null

  return (
    <Sheet ref={sheetRef} title={guided ? t('shareCard.periodQuestion') : t('shareCard.share')} accessibleTitle={guided ? undefined : t('shareCard.title')} onAttemptDismiss={() => { resetFeedback(); closeSheet(onClose) }} actions={actions}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-col gap-section-gap">
          <SharePeriodControl guided={guided} period={period} disabled={isSharing} onSelect={selectPeriod} />
          {isLoading || (!recap && !isError) ? <div role="progressbar" aria-busy="true" aria-label={t('shareCard.loading')} className="flex min-h-[640px] flex-col justify-center gap-section-gap">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} variant="stat-tile" grouped />)}
          </div> : null}
          {isError ? <ShareLoadError guided={guided} onRetry={() => void refetch()} /> : null}
          {!isLoading && !isError && isEmpty ? <EmptyState title={t('shareCard.empty')} /> : null}
          {card && guided ? <SharePreviewChange period={period} changed={periodChanged}>{card}</SharePreviewChange> : card}
        </div>
        <ShareCardFeedback hasError={hasError} savedFileName={savedFileName} />
      </div>
    </Sheet>
  )
}
