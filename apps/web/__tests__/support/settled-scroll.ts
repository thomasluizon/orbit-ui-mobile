export interface SettledScrollRequest {
  axis: 'top' | 'left'
  movedFrom: number | null
}

export interface SettledScrollPosition {
  top: number
  left: number
}

/**
 * Waits for the scroller to leave `movedFrom` on `axis` (skipped when null), then for 4 unchanged
 * frames, and returns both offsets. Runs inside the page through `locator.evaluate`, which sends the
 * function's source text, so it references nothing outside its own body.
 */
export async function readSettledScroll(element: Element, { axis, movedFrom }: SettledScrollRequest): Promise<SettledScrollPosition> {
  const position = () => (axis === 'top' ? element.scrollTop : element.scrollLeft)
  const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (movedFrom !== null) {
    for (let frame = 0; frame < 120 && position() === movedFrom; frame++) await nextFrame()
  }
  let previous = position()
  let stableFrames = 0
  for (let frame = 0; frame < 120 && stableFrames < 4; frame++) {
    await nextFrame()
    stableFrames = position() === previous ? stableFrames + 1 : 0
    previous = position()
  }
  return { top: element.scrollTop, left: element.scrollLeft }
}
