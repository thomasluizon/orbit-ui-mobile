import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useWindowDimensions, type View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DidPresentEvent } from '@lodev09/react-native-true-sheet'
import * as Sentry from '@sentry/react-native'
import type { SheetFooterProbe } from '@/components/ui/sheet'
import type { UpdateSheetFooterMeasurement } from '@/lib/posthog'

const FOOTER_LAYOUT_WAIT_MS = 1000
const PIXEL_ROUNDING_TOLERANCE = 1

export type ReportUpdateSheetFooter = (measurement: UpdateSheetFooterMeasurement) => void

interface FooterViewport {
  width: number
  height: number
  fontScale: number
  bottomInset: number
}

interface FooterReading {
  footerHeight: number | null
  footerSpaceHeight: number | null
  sheetPosition: number | null
  footerLocalBottom: number | null
}

function describeFooter(viewport: FooterViewport, reading: FooterReading): UpdateSheetFooterMeasurement {
  const { sheetPosition, footerLocalBottom } = reading
  // WHY: measureInWindow stops at the TrueSheetView root node, so its y is local to the sheet container; onDidPresent's position places that container in the window frame. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/common/cpp/react/renderer/components/TrueSheetSpec/TrueSheetViewShadowNode.h#L25-L29
  const footerBottom = sheetPosition === null || footerLocalBottom === null ? null : sheetPosition + footerLocalBottom
  return {
    footer_height: reading.footerHeight,
    footer_space_height: reading.footerSpaceHeight,
    sheet_position: sheetPosition,
    footer_local_bottom: footerLocalBottom,
    footer_bottom: footerBottom,
    window_width: viewport.width,
    window_height: viewport.height,
    font_scale: viewport.fontScale,
    bottom_inset: viewport.bottomInset,
    footer_below_window: footerBottom === null ? null : footerBottom > viewport.height + PIXEL_ROUNDING_TOLERANCE,
  }
}

function warnWhenFooterHidden(measurement: UpdateSheetFooterMeasurement) {
  const zeroHeight = !measurement.footer_height
  if (!zeroHeight && measurement.footer_below_window !== true) return
  Sentry.captureMessage('android_update_sheet_footer_hidden', {
    level: 'warning',
    tags: { operation: 'android_update_sheet_footer', reason: zeroHeight ? 'zero_height' : 'below_window' },
    extra: { ...measurement },
  })
}

/**
 * Measures the update sheet footer once per presentation, after the footer and its reserved space lay out
 * or after a bounded wait, and warns when the footer has no height or ends below the window (#2030).
 * Mount it with the sheet, so one mount is one presentation.
 */
export function useUpdateSheetFooterReport(onDidPresent: (() => ReportUpdateSheetFooter) | undefined) {
  const footerRef = useRef<View>(null)
  const footerHeightRef = useRef<number | null>(null)
  const footerSpaceHeightRef = useRef<number | null>(null)
  const sheetPositionRef = useRef<number | null>(null)
  const pendingReportRef = useRef<ReportUpdateSheetFooter | null>(null)
  const presentedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { width, height, fontScale } = useWindowDimensions()
  const { bottom } = useSafeAreaInsets()
  const viewportRef = useRef<FooterViewport>({ width, height, fontScale, bottomInset: bottom })
  useEffect(() => {
    viewportRef.current = { width, height, fontScale, bottomInset: bottom }
  }, [width, height, fontScale, bottom])

  const settle = useCallback((footerLocalBottom: number | null) => {
    const report = pendingReportRef.current
    if (!report) return
    pendingReportRef.current = null
    clearTimeout(timerRef.current)
    const measurement = describeFooter(viewportRef.current, {
      footerHeight: footerHeightRef.current,
      footerSpaceHeight: footerSpaceHeightRef.current,
      sheetPosition: sheetPositionRef.current,
      footerLocalBottom,
    })
    report(measurement)
    warnWhenFooterHidden(measurement)
  }, [])

  const measure = useCallback(() => {
    if (!pendingReportRef.current) return
    const footer = footerRef.current
    if (!footer) {
      settle(null)
      return
    }
    footer.measureInWindow((_x, y, _width, measuredHeight) => settle(y + measuredHeight))
  }, [settle])

  const measureWhenLaidOut = useCallback(() => {
    const footerHeight = footerHeightRef.current
    const footerSpaceHeight = footerSpaceHeightRef.current
    if (!footerHeight || footerSpaceHeight === null) return
    if (Math.abs(footerHeight - footerSpaceHeight) < PIXEL_ROUNDING_TOLERANCE) measure()
  }, [measure])

  useEffect(() => () => settle(null), [settle])

  const handleDidPresent = useCallback((event: DidPresentEvent) => {
    if (!onDidPresent || presentedRef.current) return
    presentedRef.current = true
    sheetPositionRef.current = event.nativeEvent.position
    pendingReportRef.current = onDidPresent()
    timerRef.current = setTimeout(measure, FOOTER_LAYOUT_WAIT_MS)
    measureWhenLaidOut()
  }, [onDidPresent, measure, measureWhenLaidOut])

  const footerProbe = useMemo<SheetFooterProbe>(() => ({
    footerRef,
    onFooterLayout: (footerHeight) => {
      footerHeightRef.current = footerHeight
      measureWhenLaidOut()
    },
    onFooterSpaceLayout: (footerSpaceHeight) => {
      footerSpaceHeightRef.current = footerSpaceHeight
      measureWhenLaidOut()
    },
  }), [measureWhenLaidOut])

  return onDidPresent ? { footerProbe, onDidPresent: handleDidPresent } : { footerProbe: undefined, onDidPresent: undefined }
}
