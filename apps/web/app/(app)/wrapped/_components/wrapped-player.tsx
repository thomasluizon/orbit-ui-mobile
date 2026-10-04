'use client'

import { useEffect, useId, useRef, useEffectEvent, type ReactNode } from 'react'
import { X } from '@/components/ui/icons'
import { useLocale, useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import { formatClosedWrappedMonth, type ClosedRecapMonth, type RecapSharePeriod } from '@orbit/shared/utils'
import { useWrappedStory, type WrappedSlide as WrappedSlideModel } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { useProfile } from '@/hooks/use-profile'
import { Pager } from '@/components/ui/pager'
import { PillButton } from '@/components/ui/pill-button'
import { useUIStore } from '@/stores/ui-store'
import { WrappedSlide } from './wrapped-slide'
import { coverEyebrowStyle } from './wrapped-styles'

interface WrappedPlayerProps {
  slides: WrappedSlideModel[]
  recap: Recap
  period: RecapSharePeriod
  closedMonth?: ClosedRecapMonth
  onClose: () => void
  notice?: ReactNode
}

type PageDirection = 'back' | 'forward'

export function WrappedPlayer({
  slides,
  recap,
  period,
  closedMonth,
  onClose,
  notice,
}: Readonly<WrappedPlayerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const windowLabel = closedMonth && period === 'month'
    ? formatClosedWrappedMonth(closedMonth, locale)
    : t(`wrapped.player.window.${period}`)
  const { index, isFirst, isLast, next, prev } = useWrappedStory(slides.length)
  const { captureRef, isSharing, hasError, savedFileName, canShareFiles, share, download } = useShareCard()
  const { profile } = useProfile()
  const current = slides[index]
  const canTapToPage = current?.id !== 'consistency' || period !== 'week' || !!profile
  const closeRef = useRef<HTMLButtonElement>(null)
  const overlayId = useId()
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)

  useEffect(() => {
    registerOpenOverlay(overlayId)
    return () => unregisterOpenOverlay(overlayId)
  }, [overlayId, registerOpenOverlay, unregisterOpenOverlay])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  function page(direction: PageDirection) {
    if (direction === 'forward') next()
    else prev()
  }

  const onNavigationKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') page('forward')
    else if (event.key === 'ArrowLeft') page('back')
    else if (event.key === 'Escape') onClose()
  })

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      onNavigationKey(event)
    }
    globalThis.addEventListener('keydown', handleKey)
    return () => globalThis.removeEventListener('keydown', handleKey)
  }, [])

  if (!current) return null

  function handleShare() {
    void share({
      shareTitle: t('shareCard.shareTitle'),
      shareText: t('shareCard.shareText'),
      url: recap.shareDeepLink,
    })
  }

  const shareActions = (
    <ShareActions
      canShareFiles={canShareFiles}
      isSharing={isSharing}
      shareLabel={t('shareCard.share')}
      downloadLabel={t('shareCard.download')}
      onShare={handleShare}
      onDownload={() => void download()}
    />
  )

  return (
    // react-doctor-disable-next-line prefer-html-dialog -- full-screen immersive Wrapped story player (not a dialog box), with custom Esc/arrow-key and focus handling; native <dialog> top-layer/backdrop semantics do not fit a full-screen takeover https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('wrapped.title')}
      className="fixed inset-0 z-modal flex flex-col overflow-hidden pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]"
      style={{ background: 'var(--bg)' }}
    >
      <div data-testid="wrapped-frame" className="mx-auto flex min-h-0 w-full max-w-[900px] flex-1 flex-col">
        <div data-testid="wrapped-header" className="flex shrink-0 items-center gap-2" style={{ padding: '8px 8px 8px 16px' }}>
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <p style={coverEyebrowStyle}>{t(`wrapped.player.eyebrow.${period}`)}</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>{windowLabel}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t('wrapped.close')}
            onClick={onClose}
            className="icon-btn touch-target shrink-0 overflow-hidden"
          >
            <X size={20} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div key={current.id} data-testid="wrapped-page-scroll" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <WrappedSlide
            slide={current}
            recap={recap}
            period={period}
            captureRef={captureRef}
            shareError={hasError}
            savedFileName={savedFileName}
          />
          {!isLast && canTapToPage && <TapZones isFirst={isFirst} onPage={page} />}
        </div>
        <div className="shrink-0 bg-[var(--bg)]">
          {notice !== undefined ? <div data-shell-notice="">{notice}</div> : null}
          <PlayerPager
            count={slides.length}
            index={index}
            isFirst={isFirst}
            isLast={isLast}
            progressLabel={t('wrapped.progressLabel', { current: index + 1, total: slides.length })}
            backLabel={t('wrapped.previous')}
            forwardLabel={t('wrapped.next')}
            forwardSlot={shareActions}
            onPage={page}
          />
        </div>
      </div>
    </div>
  )
}

interface ShareActionsProps {
  canShareFiles: boolean
  isSharing: boolean
  shareLabel: string
  downloadLabel: string
  onShare: () => void
  onDownload: () => void
}

function ShareActions(props: Readonly<ShareActionsProps>) {
  const downloadButton = (
    <PillButton
      variant={props.canShareFiles ? 'ghost' : 'primary'}
      loading={props.isSharing}
      disabled={props.isSharing}
      onClick={props.onDownload}
    >
      {props.downloadLabel}
    </PillButton>
  )

  if (!props.canShareFiles) return downloadButton

  const shareButton = (
    <PillButton loading={props.isSharing} disabled={props.isSharing} onClick={props.onShare}>
      {props.shareLabel}
    </PillButton>
  )

  return <>{downloadButton}{shareButton}</>
}

function TapZones({ isFirst, onPage }: Readonly<{ isFirst: boolean; onPage: (direction: PageDirection) => void }>) {
  return (
    <div aria-hidden="true" className="absolute inset-0 z-10 flex">
      <button
        type="button"
        tabIndex={-1}
        data-testid="wrapped-previous-zone"
        onClick={() => onPage('back')}
        disabled={isFirst}
        className="h-full"
        style={{ flex: 1, cursor: isFirst ? 'default' : 'pointer', background: 'transparent', border: 0 }}
      />
      <button
        type="button"
        tabIndex={-1}
        data-testid="wrapped-next-zone"
        onClick={() => onPage('forward')}
        className="h-full"
        style={{ flex: 2, cursor: 'pointer', background: 'transparent', border: 0 }}
      />
    </div>
  )
}

interface PlayerPagerProps {
  count: number
  index: number
  isFirst: boolean
  isLast: boolean
  progressLabel: string
  backLabel: string
  forwardLabel: string
  forwardSlot: ReactNode
  onPage: (direction: PageDirection) => void
}

function PlayerPager(props: Readonly<PlayerPagerProps>) {
  return (
    <div data-testid="wrapped-pager" style={{ padding: 16 }}>
      {props.isLast ? (
        <Pager
          count={props.count}
          index={props.index}
          label={props.progressLabel}
          backLabel={props.backLabel}
          onBack={() => props.onPage('back')}
          forwardSlot={props.forwardSlot}
        />
      ) : (
        <Pager
          count={props.count}
          index={props.index}
          label={props.progressLabel}
          backLabel={props.backLabel}
          onBack={props.isFirst ? undefined : () => props.onPage('back')}
          forwardLabel={props.forwardLabel}
          onForward={() => props.onPage('forward')}
        />
      )}
    </div>
  )
}
