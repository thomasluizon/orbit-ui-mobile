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

interface DesktopTargetBounds {
  x: number
  y: number
  width: number
  height: number
}

interface VerticalDesktopPositionParams extends DesktopTargetBounds {
  placement: 'top' | 'bottom'
  tooltipWidth: number
  tooltipHeight: number
  viewportHeight: number
}

interface HorizontalDesktopPositionParams extends DesktopTargetBounds {
  placement: 'left' | 'right'
  tooltipWidth: number
  tooltipHeight: number
  viewportWidth: number
}

function clampDesktopPosition(
  position: { top: number; left: number },
  tooltipWidth: number,
  tooltipHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    left: Math.max(
      EDGE_PADDING,
      Math.min(position.left, viewportWidth - tooltipWidth - EDGE_PADDING),
    ),
    top: Math.max(
      EDGE_PADDING,
      Math.min(position.top, viewportHeight - tooltipHeight - EDGE_PADDING),
    ),
  }
}

function computeVerticalDesktopPosition(
  params: VerticalDesktopPositionParams,
) {
  const { placement, x, y, width, height, tooltipWidth, tooltipHeight, viewportHeight } = params
  const left = x + width / 2 - tooltipWidth / 2

  if (placement === 'bottom') {
    const bottomTop = y + height + TOOLTIP_GAP
    return {
      top:
        bottomTop + tooltipHeight > viewportHeight - EDGE_PADDING
          ? y - tooltipHeight - TOOLTIP_GAP
          : bottomTop,
      left,
    }
  }

  const topTop = y - tooltipHeight - TOOLTIP_GAP
  return {
    top: topTop < EDGE_PADDING ? y + height + TOOLTIP_GAP : topTop,
    left,
  }
}

function computeHorizontalDesktopPosition(
  params: HorizontalDesktopPositionParams,
) {
  const { placement, x, y, width, height, tooltipWidth, tooltipHeight, viewportWidth } = params
  const top = y + height / 2 - tooltipHeight / 2

  if (placement === 'right') {
    const rightLeft = x + width + TOOLTIP_GAP
    return {
      top,
      left:
        rightLeft + tooltipWidth > viewportWidth - EDGE_PADDING
          ? x - tooltipWidth - TOOLTIP_GAP
          : rightLeft,
    }
  }

  const leftLeft = x - tooltipWidth - TOOLTIP_GAP
  return {
    top,
    left: leftLeft < EDGE_PADDING ? x + width + TOOLTIP_GAP : leftLeft,
  }
}

function computeDesktopPosition(params: DesktopLayoutParams): { top: number; left: number } {
  const {
    tooltipWidth,
    tooltipHeight,
    viewportWidth,
    viewportHeight,
    targetRect,
    placement,
  } = params
  const pad = 8
  const paddedTargetBounds: DesktopTargetBounds = {
    x: targetRect.x - pad,
    y: targetRect.y - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  }

  const position =
    placement === 'bottom' || placement === 'top'
      ? computeVerticalDesktopPosition(
          {
            ...paddedTargetBounds,
            placement,
            tooltipWidth,
            tooltipHeight,
            viewportHeight,
          },
        )
      : computeHorizontalDesktopPosition(
          {
            ...paddedTargetBounds,
            placement,
            tooltipWidth,
            tooltipHeight,
            viewportWidth,
          },
        )

  return clampDesktopPosition(
    position,
    tooltipWidth,
    tooltipHeight,
    viewportWidth,
    viewportHeight,
  )
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
  const tooltipRef = useRef<HTMLDialogElement>(null)
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
    window.addEventListener('resize', layout)
    return () => window.removeEventListener('resize', layout)
  }, [layout])

  useEffect(() => {
    const frame = requestAnimationFrame(layout)
    return () => cancelAnimationFrame(frame)
  }, [layout])

  const nextButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => nextButtonRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [step])

  const sectionName = sectionProgress.section
    ? t(`tour.sections.${sectionProgress.section}`)
    : ''

  const modeClassName = (() => {
    if (mode === 'float') return 'fixed z-[9999] w-[360px] rounded-[12px] border border-[var(--hairline)] bg-[var(--bg-elev)] px-6 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]'
    if (mode === 'sheet-top') return 'fixed top-0 left-0 right-0 z-[9999] rounded-b-[12px] border-b border-[var(--hairline)] bg-[var(--bg-elev)] px-6 pt-3 pb-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]'
    return 'fixed bottom-0 left-0 right-0 z-[9999] rounded-t-[12px] border-t border-[var(--hairline)] bg-[var(--bg-elev)] px-6 pt-3 pb-[calc(1.75rem+var(--safe-bottom))] shadow-[0_12px_40px_rgba(0,0,0,0.35)]'
  })()

  const floatStyle = (() => {
    if (mode !== 'float') return undefined
    if (!pos) return { top: -9999, left: -9999, opacity: 0 }
    return { top: pos.top, left: pos.left }
  })()

  const content = (
    <dialog
      open
      ref={tooltipRef}
      className={modeClassName}
      style={floatStyle}
      aria-modal="true"
      aria-label={t(step.titleKey)}
    >
      {mode !== 'float' && (
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--hairline-strong)]" />
      )}

      <div className="mb-3 flex items-center gap-2">
        {SectionIcon && <SectionIcon className="size-4 text-[var(--primary)]" />}
        <span className="text-xs italic text-[var(--fg-2)]">{sectionName}</span>
        <span className="font-[var(--font-family-mono)] text-[11px] uppercase tracking-[0.04em] text-[var(--fg-3)]">
          {t('tour.ui.stepOf', {
            current: sectionProgress.current,
            total: sectionProgress.total,
          })}
        </span>
        {step.proBadge && (
          <span className="ml-auto rounded-full border border-[var(--hairline)] bg-[var(--bg-sunk)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--primary)]">
            {t('tour.ui.pro')}
          </span>
        )}
      </div>

      <h3 className="mb-1.5 text-[length:var(--text-fluid-xl)] font-extrabold tracking-tight text-[var(--fg-1)]">
        {t(step.titleKey)}
      </h3>

      <p className="mb-4 text-sm italic leading-relaxed text-[var(--fg-2)]">
        {t(step.descriptionKey)}
      </p>

      <div className="mb-4 flex items-center justify-center gap-1">
        {Array.from({ length: sectionProgress.total }).map((_, i) => {
          let dotClass: string
          if (i === sectionProgress.current - 1) {
            dotClass = 'w-4 bg-[var(--primary)]'
          } else if (i < sectionProgress.current - 1) {
            dotClass = 'w-1.5 bg-[var(--primary)]/40'
          } else {
            dotClass = 'w-1.5 bg-[var(--hairline)]'
          }
          return (
            <div
              key={`progress-dot-${sectionProgress.section}-${i}`}
              className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${dotClass}`}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        {isFirstStep ? (
          <div />
        ) : (
          <button
            type="button"
            onClick={onPrev}
            className="flex items-center gap-1 rounded-[10px] px-3 py-2.5 text-sm italic text-[var(--fg-2)] transition-colors duration-150 ease-out hover:bg-[var(--bg-sunk)] hover:text-[var(--fg-1)]"
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
          className="flex items-center gap-1 rounded-[10px] bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--fg-on-primary)] transition-[background-color] duration-150 ease-out hover:bg-[var(--primary-pressed)]"
        >
          {isLastStep ? t('tour.ui.finish') : t('tour.ui.next')}
          {!isLastStep && <ChevronRight className="size-4" />}
        </button>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mt-3 w-full text-center text-xs italic text-[var(--fg-3)] transition-colors duration-150 ease-out hover:text-[var(--fg-2)]"
      >
        {t('tour.ui.skip')}
      </button>
    </dialog>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
