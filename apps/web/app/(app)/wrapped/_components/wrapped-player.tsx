'use client'

import { useEffect, useRef, useEffectEvent } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Recap } from '@orbit/shared/types/gamification'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useWrappedStory, type WrappedSlide as WrappedSlideModel } from '@/hooks/use-wrapped'
import { WrappedSlide } from './wrapped-slide'

interface WrappedPlayerProps {
  slides: WrappedSlideModel[]
  recap: Recap
  period: RecapSharePeriod
  displayName?: string
  onClose: () => void
}

/** Full-viewport tap/keyboard-driven Wrapped story: segmented progress, prev/next zones, Esc/Arrow keys, Share CTA last. */
export function WrappedPlayer({
  slides,
  recap,
  period,
  displayName,
  onClose,
}: Readonly<WrappedPlayerProps>) {
  const t = useTranslations()
  const { index, isFirst, isLast, next, prev } = useWrappedStory(slides.length)
  const current = slides[index]
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const onNavigationKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') next()
    else if (event.key === 'ArrowLeft') prev()
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

  return (
    // react-doctor-disable-next-line prefer-html-dialog -- full-screen immersive Wrapped story player (not a dialog box), with custom Esc/arrow-key and focus handling; native <dialog> top-layer/backdrop semantics do not fit a full-screen takeover https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('wrapped.title')}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{
        background:
          'radial-gradient(135% 100% at 50% 0%, rgba(var(--primary-rgb), 0.32) 0%, rgba(var(--primary-rgb), 0.1) 40%, transparent 72%), var(--bg)',
      }}
    >
      <div className="mx-auto flex w-full flex-1 flex-col md:max-w-[480px]">
        <div className="flex items-center" style={{ gap: 6, padding: '12px 16px 4px' }}>
          {isLast && (
            <button
              type="button"
              aria-label={t('wrapped.previous')}
              onClick={prev}
              className="icon-btn"
            >
              <ChevronLeft size={22} strokeWidth={1.8} />
            </button>
          )}
          <div
            data-testid="wrapped-progress"
            role="img"
            aria-label={t('wrapped.progressLabel', { current: index + 1, total: slides.length })}
            className="flex flex-1 items-center"
            style={{ gap: 6 }}
          >
            {slides.map((slide, slideIndex) => (
              <span
                key={slide.id}
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: slideIndex <= index ? 'var(--primary)' : 'var(--bg-elev-2)',
                  opacity: slideIndex <= index ? 1 : 0.6,
                  transition:
                    'background-color var(--dur-fast) var(--ease-standard), opacity var(--dur-fast) var(--ease-standard)',
                }}
              />
            ))}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t('wrapped.close')}
            onClick={onClose}
            className="icon-btn"
          >
            <X size={22} strokeWidth={1.8} />
          </button>
        </div>

        <div key={current.id} className="flex flex-1 flex-col">
          <WrappedSlide slide={current} recap={recap} period={period} displayName={displayName} />
        </div>
      </div>

      {!isLast && (
        <div className="absolute inset-0 flex" style={{ top: 56 }}>
          <button
            type="button"
            aria-label={t('wrapped.previous')}
            onClick={prev}
            disabled={isFirst}
            className="h-full"
            style={{ flex: 1, cursor: isFirst ? 'default' : 'pointer', background: 'transparent', border: 0 }}
          />
          <button
            type="button"
            aria-label={t('wrapped.next')}
            onClick={next}
            className="h-full"
            style={{ flex: 2, cursor: 'pointer', background: 'transparent', border: 0 }}
          />
        </div>
      )}
    </div>
  )
}
