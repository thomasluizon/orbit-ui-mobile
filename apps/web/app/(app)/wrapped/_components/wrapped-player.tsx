'use client'

import { useEffect, useRef, useEffectEvent, type ReactNode } from 'react'
import { X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useWrappedStory, type WrappedSlide as WrappedSlideModel } from '@/hooks/use-wrapped'
import { useShareCard } from '@/hooks/use-share-card'
import { Pager } from '@/components/ui/pager'
import { PillButton } from '@/components/ui/pill-button'
import { WrappedSlide } from './wrapped-slide'

interface WrappedPlayerProps {
  slides: WrappedSlideModel[]
  recap: Recap
  period: RecapSharePeriod
  onClose: () => void
}

type PageDirection = 'back' | 'forward'

export function WrappedPlayer({
  slides,
  recap,
  period,
  onClose,
}: Readonly<WrappedPlayerProps>) {
  const t = useTranslations()
  const { index, isFirst, isLast, next, prev } = useWrappedStory(slides.length)
  const { captureRef, isSharing, hasError, savedFileName, canShareFiles, share, download } = useShareCard()
  const current = slides[index]
  const closeRef = useRef<HTMLButtonElement>(null)

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
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg)' }}
    >
      <div className="mx-auto flex w-full flex-1 flex-col md:max-w-[480px]">
        <div className="flex justify-end" style={{ padding: '12px 16px 4px' }}>
          <button
            ref={closeRef}
            type="button"
            aria-label={t('wrapped.close')}
            onClick={onClose}
            className="icon-btn"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
        </div>

        <div key={current.id} className="relative flex min-h-0 flex-1 flex-col">
          <WrappedSlide
            slide={current}
            recap={recap}
            period={period}
            captureRef={captureRef}
            shareError={hasError}
            savedFileName={savedFileName}
          />
          {!isLast && <TapZones isFirst={isFirst} onPage={page} />}
        </div>
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

  return (
    <>
      <div data-testid="wrapped-share-actions-narrow" className="flex flex-col items-stretch gap-2 sm:hidden">
        {shareButton}
        {downloadButton}
      </div>
      <div data-testid="wrapped-share-actions-wide" className="hidden items-center gap-2 sm:flex">
        {downloadButton}
        {shareButton}
      </div>
    </>
  )
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
