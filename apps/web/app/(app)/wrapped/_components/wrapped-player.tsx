'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
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

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') prev()
      else if (event.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', handleKey)
    return () => globalThis.removeEventListener('keydown', handleKey)
  }, [next, prev, onClose])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('wrapped.title')}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: 220, background: 'var(--gradient-header)' }}
      />

      <div className="flex items-center" style={{ gap: 6, padding: '12px 16px 4px' }}>
        <div data-testid="wrapped-progress" className="flex flex-1 items-center" style={{ gap: 6 }}>
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
              }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label={t('wrapped.close')}
          onClick={onClose}
          className="inline-flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 999, color: 'var(--fg-1)' }}
        >
          <X size={22} strokeWidth={1.8} />
        </button>
      </div>

      <div key={current.id} className="animate-slide-up flex flex-1 flex-col" style={{ minHeight: 0 }}>
        <WrappedSlide slide={current} recap={recap} period={period} displayName={displayName} />
      </div>

      {!isLast && (
        <div aria-hidden={false} className="absolute inset-0 flex" style={{ top: 56 }}>
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
