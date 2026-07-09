'use client'

import { createPortal } from 'react-dom'
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type RefObject,
} from 'react'
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
import { ProBadge } from '@/components/ui/pro-badge'

interface TourTooltipProps {
  step: TourStep
  targetRect: TourTargetRect
  sectionProgress: { current: number; total: number; section: TourSection | null }
  isFirstStep: boolean
  isLastStep: boolean
  dialogRef: RefObject<HTMLDialogElement | null>
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
  dialogRef,
  onNext,
  onPrev,
  onSkip,
}: TourTooltipProps) {
  const t = useTranslations()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mode, setMode] = useState<'float' | 'sheet-top' | 'sheet-bottom'>('sheet-bottom')

  const iconKey = TOUR_SECTION_ICONS[step.section]
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

    const el = dialogRef.current
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
  }, [targetRect, step.placement, dialogRef])

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
    if (mode === 'float') return 'fixed z-[9999] w-[360px] rounded-[18px] bg-[var(--bg-sheet)] px-6 py-5'
    if (mode === 'sheet-top') return 'fixed top-0 left-0 right-0 z-[9999] w-full rounded-b-[26px] bg-[var(--bg-sheet)] px-6 pt-3 pb-5'
    return 'fixed bottom-0 left-0 right-0 z-[9999] w-full rounded-t-[26px] bg-[var(--bg-sheet)] px-6 pt-3 pb-[calc(1.75rem+var(--safe-bottom))]'
  })()

  const surfaceStyle = {
    boxShadow: 'var(--shadow-3), inset 0 0 0 1px var(--hairline)',
  }

  const floatStyle = (() => {
    if (mode !== 'float') return undefined
    if (!pos) return { top: -9999, left: -9999, opacity: 0 }
    return { top: pos.top, left: pos.left }
  })()

  const entranceStyle = (() => {
    if (mode === 'float' && !pos) return undefined
    if (mode === 'sheet-top' || mode === 'sheet-bottom') {
      return { animation: 'slide-up-fade 0.28s var(--ease-out) backwards' }
    }
    return { animation: 'scale-in 0.22s var(--ease-out) backwards' }
  })()

  const content = (
    <dialog
      key={step.id}
      open
      ref={dialogRef}
      className={modeClassName}
      style={{ ...surfaceStyle, ...floatStyle, ...entranceStyle }}
      aria-modal="true"
      aria-label={t(step.titleKey)}
    >
      {mode === 'sheet-bottom' && (
        <div className="mx-auto mb-4 h-[5px] w-11 rounded-full bg-[var(--hairline-strong)]" />
      )}

      <div className="mb-3 flex items-center gap-2">
        {SectionIcon && <SectionIcon className="size-4 text-[var(--primary)]" strokeWidth={1.8} />}
        <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--fg-3)]">
          {sectionName}
        </span>
        <span aria-hidden="true" className="text-[12px] text-[var(--fg-4)]">
          ·
        </span>
        <span className="font-(family-name:--font-mono) text-[12px] uppercase tracking-[0.04em] text-[var(--fg-3)] [font-variant-numeric:tabular-nums]">
          {t('tour.ui.stepOf', {
            current: sectionProgress.current,
            total: sectionProgress.total,
          })}
        </span>
        {step.proBadge && (
          <ProBadge alwaysVisible label={t('tour.ui.pro')} className="ml-auto" />
        )}
      </div>

      <h3 className="mb-1.5 text-[16px] font-medium tracking-[-0.01em] text-[var(--fg-1)] [text-wrap:balance]">
        {t(step.titleKey)}
      </h3>

      <p className="mb-4 text-[14px] leading-[1.55] text-[var(--fg-2)] [text-wrap:pretty]">
        {t(step.descriptionKey)}
      </p>

      <div aria-hidden="true" className="mb-4 flex items-center justify-center gap-1.5">
        {Array.from({ length: sectionProgress.total }).map((_, i) => {
          let dotStyle: CSSProperties
          if (i === sectionProgress.current - 1) {
            dotStyle = { transform: 'scaleX(1)', background: 'var(--primary)' }
          } else if (i < sectionProgress.current - 1) {
            dotStyle = { transform: 'scaleX(0.5)', background: 'rgba(var(--primary-rgb), 0.4)' }
          } else {
            dotStyle = { transform: 'scaleX(0.5)', background: 'var(--fg-4)' }
          }
          return (
            <div
              key={`progress-dot-${sectionProgress.section}-${i}`}
              className="h-2 w-4 rounded-full transition-[transform,background-color] duration-[var(--dur-base)] ease-[var(--ease-standard)]"
              style={dotStyle}
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
            aria-label={t('tour.ui.back')}
            className="flex size-11 items-center justify-center rounded-full text-[var(--fg-2)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.96]"
          >
            <ChevronLeft size={22} strokeWidth={1.8} />
          </button>
        )}
        <div className="flex-1" />
        <button
          ref={nextButtonRef}
          type="button"
          onClick={onNext}
          className="flex min-h-[44px] items-center gap-1 rounded-full bg-[var(--primary)] px-[18px] text-[15px] font-medium text-[var(--fg-on-primary)] shadow-[var(--primary-glow)] transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] hover:shadow-[var(--primary-glow-hover)] active:translate-y-0 active:scale-[0.96]"
        >
          {isLastStep ? t('tour.ui.finish') : t('tour.ui.next')}
          {!isLastStep && <ChevronRight className="size-4" strokeWidth={1.8} />}
        </button>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="mx-auto mt-2 flex min-h-[44px] w-fit items-center justify-center px-6 text-center text-[13px] text-[var(--fg-3)] transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-2)] active:scale-[0.96]"
      >
        {t('tour.ui.skip')}
      </button>

      {mode === 'sheet-top' && (
        <div className="mx-auto mt-4 h-[5px] w-11 rounded-full bg-[var(--hairline-strong)]" />
      )}
    </dialog>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
