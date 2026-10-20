export interface PopoverAnchorRect {
  x: number
  y: number
  width: number
  height: number
}

interface PopoverPositionArgs {
  anchorRect: PopoverAnchorRect
  viewportWidth: number
  viewportHeight: number
  popoverWidth: number
  popoverHeight: number
  gap?: number
}

export interface PopoverPosition {
  left: number
  top: number
  opensUp: boolean
}

export const DEFAULT_POPOVER_EDGE_GAP = 8

export function getPopoverPosition({
  anchorRect,
  viewportWidth,
  viewportHeight,
  popoverWidth,
  popoverHeight,
  gap = DEFAULT_POPOVER_EDGE_GAP,
}: PopoverPositionArgs): PopoverPosition {
  const preferredLeft = anchorRect.x + anchorRect.width - popoverWidth
  const maxLeft = viewportWidth - popoverWidth - gap
  const left = Math.min(Math.max(preferredLeft, gap), Math.max(gap, maxLeft))
  const opensUp = anchorRect.y + anchorRect.height + popoverHeight + gap > viewportHeight
  const preferredTop = opensUp
    ? anchorRect.y - popoverHeight - gap
    : anchorRect.y + anchorRect.height + gap
  const top = Math.min(
    Math.max(preferredTop, gap),
    Math.max(gap, viewportHeight - popoverHeight - gap),
  )

  return { left, top, opensUp }
}

export const FALLBACK_POPOVER_TOP_INSET = 56

export function getFallbackPopoverAnchorRect(
  viewportWidth: number,
  gap = DEFAULT_POPOVER_EDGE_GAP,
): PopoverAnchorRect {
  return {
    x: viewportWidth - gap,
    y: FALLBACK_POPOVER_TOP_INSET,
    width: 0,
    height: 0,
  }
}
