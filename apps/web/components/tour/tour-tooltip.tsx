'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { TourStep, TourSection } from '@orbit/shared/types'
import type { TourTargetRect } from '@orbit/shared/stores'
import { TOUR_SECTION_ICONS } from '@orbit/shared/types'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Target,
  MessageCircle,
  CalendarDays,
  User,
} from 'lucide-react'

interface TourTooltipProps {
  step: TourStep
  targetRect: TourTargetRect
  sectionProgress: { current: number; total: number; section: TourSection | null }
  isFirstStep: boolean
  isLastStep: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

const SECTION_ICON_MAP = {
  'check-circle': CheckCircle,
  'target': Target,
  'message-circle': MessageCircle,
  'calendar-days': CalendarDays,
  'user': User,
} as const

const TOOLTIP_GAP = 16
const EDGE_PADDING = 16

interface DesktopLayoutParams {
  tooltipWidth: number
  tooltipHeight: number
  viewportWidth: number
  viewportHeight: number
  targetRect: TourTargetRect
  placement: TourStep['placement']
}

function computeDesktopPosition(params: DesktopLayoutParams): { top: number; left: number } {
  const { tooltipWidth: tw, tooltipHeight: th, viewportWidth: vw, viewportHeight: vh, targetRect, placement } = params
  const pad = 8
  const sx = targetRect.x - pad
  const sy = targetRect.y - pad
  const sw = targetRect.width + pad * 2
  const sh = targetRect.height + pad * 2

  let top: number
  let left: number

  if (placement === 'bottom' || placement === 'top') {
    left = sx + sw / 2 - tw / 2
    if (placement === 'bottom') {
      top = sy + sh + TOOLTIP_GAP
      if (top + th > vh - EDGE_PADDING) top = sy - th - TOOLTIP_GAP
    } else {
      top = sy - th - TOOLTIP_GAP
      if (top < EDGE_PADDING) top = sy + sh + TOOLTIP_GAP
    }
  } else {
    top = sy + sh / 2 - th / 2
    if (placement === 'right') {
      left = sx + sw + TOOLTIP_GAP
      if (left + tw > vw - EDGE_PADDING) left = sx - tw - TOOLTIP_GAP
    } else {
      left = sx - tw - TOOLTIP_GAP
      if (left < EDGE_PADDING) left = sx + sw + TOOLTIP_GAP
    }
  }

  // Clamp to viewport
  left = Math.max(EDGE_PADDING, Math.min(left, vw - tw - EDGE_PADDING))
  top = Math.max(EDGE_PADDING, Math.min(top, vh - th - EDGE_PADDING))

  return { top, left }
}

export function TourTooltip({
  step,
  targetRect,
  sectionProgress,
  isFirstStep,
  isLastStep,
  onNext,
  onPrev,
  onSkip,
}: TourTooltipProps) {
  const t = useTranslations()
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mode, setMode] = useState<'float' | 'sheet-top' | 'sheet-bottom'>('sheet-bottom')

  const iconKey = step.section ? TOUR_SECTION_ICONS[step.section] : undefined
  const SectionIcon = iconKey
    ? SECTION_ICON_MAP[iconKey as keyof typeof SECTION_ICON_MAP]
    : undefined

  const layout = useCallback(() => {
    const isDesktop = window.innerWidth >= 640
    if (!isDesktop) {
      const vh = window.innerHeight
      const targetCenter = targetRect.y + targetRect.height / 2
      setMode(targetCenter > vh * 0.5 ? 'sheet-top' : 'sheet-bottom')
      return
    }
    setMode('float')

    const el = tooltipRef.current
    if (!el) return

    const { width: tw, height: th } = el.getBoundingClientRect()
    setPos(computeDesktopPosition({
      tooltipWidth: tw,
      tooltipHeight: th,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      targetRect,
      placement: step.placement,
    }))
  }, [targetRect, step.placement])

  useEffect(() => {
    layout()
    window.addEventListener('resize', layout)
    return () => window.removeEventListener('resize', layout)
  }, [layout])

  useEffect(() => {
    const frame = requestAnimationFrame(layout)
    return () => cancelAnimationFrame(frame)
  }, [layout])

  // Auto-focus "Next" button on step change
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // Delay focus to allow layout to settle
    const timer = setTimeout(() => nextButtonRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [step])

  const sectionName = sectionProgress.section
    ? t(`tour.sections.${sectionProgress.section}`)
    : ''

  const modeClassName = (() => {
    if (mode === 'float') return 'fixed z-[9999] w-[340px] rounded-2xl border border-border bg-surface p-5 shadow-2xl'
    if (mode === 'sheet-top') return 'fixed top-0 left-0 right-0 z-[9999] rounded-b-2xl border-b border-border bg-surface p-5 pt-3 shadow-2xl'
    return 'fixed bottom-0 left-0 right-0 z-[9999] rounded-t-2xl border-t border-border bg-surface p-5 pb-8 shadow-2xl'
  })()

  const floatStyle = mode === 'float'
    ? (pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, opacity: 0 })
    : undefined

  const content = (
    <div
      ref={tooltipRef}
      className={modeClassName}
      style={floatStyle}
      role="dialog"
      aria-modal="true"
      aria-label={t(step.titleKey)}
    >
      {/* Drag handle on mobile */}
      {mode !== 'float' && (
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border" />
      )}

      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        {SectionIcon && <SectionIcon className="size-4 text-primary" />}
        <span className="text-xs font-medium text-text-secondary">{sectionName}</span>
        <span className="text-xs text-text-muted">
          {t('tour.ui.stepOf', {
            current: sectionProgress.current,
            total: sectionProgress.total,
          })}
        </span>
        {step.proBadge && (
          <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            {t('tour.ui.pro')}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="mb-1.5 text-base font-semibold text-text-primary">
        {t(step.titleKey)}
      </h3>

      {/* Description */}
      <p className="mb-4 text-sm leading-relaxed text-text-secondary">
        {t(step.descriptionKey)}
      </p>

      {/* Progress dots */}
      <div className="mb-4 flex items-center justify-center gap-1">
        {Array.from({ length: sectionProgress.total }).map((_, i) => {
          let dotClass: string
          if (i === sectionProgress.current - 1) {
            dotClass = 'w-4 bg-primary'
          } else if (i < sectionProgress.current - 1) {
            dotClass = 'w-1.5 bg-primary/40'
          } else {
            dotClass = 'w-1.5 bg-border'
          }
          return (
            <div
              key={`progress-dot-${sectionProgress.section}-${i}`}
              className={`h-1.5 rounded-full transition-all duration-200 ${dotClass}`}
            />
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        {isFirstStep ? (
          <div />
        ) : (
          <button
            type="button"
            onClick={onPrev}
            className="flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            <ChevronLeft className="size-4" />
            {t('tour.ui.back')}
          </button>
        )}
        <div className="flex-1" />
        <button
          ref={nextButtonRef}
          type="button"
          onClick={onNext}
          className="flex items-center gap-1 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          {isLastStep ? t('tour.ui.finish') : t('tour.ui.next')}
          {!isLastStep && <ChevronRight className="size-4" />}
        </button>
      </div>

      {/* Skip */}
      <button
        type="button"
        onClick={onSkip}
        className="mt-2 w-full text-center text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        {t('tour.ui.skip')}
      </button>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
