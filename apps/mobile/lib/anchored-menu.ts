export interface MenuAnchorRect {
  x: number
  y: number
  width: number
  height: number
}

interface AnchoredMenuPositionArgs {
  anchorRect: MenuAnchorRect
  viewportWidth: number
  viewportHeight: number
  menuWidth: number
  menuHeight: number
  margin?: number
}

export interface AnchoredMenuPosition {
  left: number
  top: number
  opensUp: boolean
}

export const DEFAULT_ANCHORED_MENU_MARGIN = 8

export function getAnchoredMenuPosition({
  anchorRect,
  viewportWidth,
  viewportHeight,
  menuWidth,
  menuHeight,
  margin = DEFAULT_ANCHORED_MENU_MARGIN,
}: AnchoredMenuPositionArgs): AnchoredMenuPosition {
  const preferredLeft = anchorRect.x + anchorRect.width - menuWidth
  const maxLeft = viewportWidth - menuWidth - margin
  const left = Math.min(
    Math.max(preferredLeft, margin),
    Math.max(margin, maxLeft),
  )

  const opensUp =
    anchorRect.y + anchorRect.height + menuHeight + margin > viewportHeight

  const preferredTop = opensUp
    ? anchorRect.y - menuHeight - margin
    : anchorRect.y + anchorRect.height + margin

  const top = Math.min(
    Math.max(preferredTop, margin),
    Math.max(margin, viewportHeight - menuHeight - margin),
  )

  return { left, top, opensUp }
}

export const FALLBACK_ANCHOR_TOP_INSET = 56

/**
 * Top-right fallback anchor used when a trigger's measured rect is unavailable —
 * e.g. when Android Fabric's native `measureInWindow` silently no-ops — so an
 * opened menu always paints near the top-right instead of rendering nothing.
 */
export function getFallbackAnchorRect(
  viewportWidth: number,
  margin = DEFAULT_ANCHORED_MENU_MARGIN,
): MenuAnchorRect {
  return {
    x: viewportWidth - margin,
    y: FALLBACK_ANCHOR_TOP_INSET,
    width: 0,
    height: 0,
  }
}
