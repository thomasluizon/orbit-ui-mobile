/**
 * Pure snap-point math for the bottom-sheet modal. Kept free of React Native so
 * it can be unit-tested in isolation.
 */

function toPixelHeight(snapPoint: string | number, screenHeight: number): number {
  if (typeof snapPoint === 'number') return snapPoint
  const percent = Number.parseFloat(snapPoint)
  const ratio = Number.isFinite(percent) ? percent / 100 : 0
  return screenHeight * ratio
}

/**
 * Resolve a sheet's snap points into ascending, cap-clamped, de-duplicated
 * pixel heights. Percentage strings (`'80%'`) resolve against `screenHeight`;
 * raw numbers pass through. Every height is clamped to `maxHeight` so a sheet
 * can never exceed its available room. Always returns at least one height, so
 * callers can safely read `result[0]` as the smallest (opening) snap.
 */
export function resolveSnapHeights(
  snapPoints: (string | number)[],
  screenHeight: number,
  maxHeight: number,
): [number, ...number[]] {
  const heights = snapPoints.map((snapPoint) =>
    Math.round(Math.min(toPixelHeight(snapPoint, screenHeight), maxHeight)),
  )
  const unique = Array.from(new Set(heights)).sort((first, second) => first - second)
  const [smallest, ...rest] = unique
  return smallest === undefined ? [maxHeight] : [smallest, ...rest]
}

/**
 * Pick the snap height a released drag should settle on. Biases toward the next
 * snap in the fling direction when the release velocity is past `velocityBias`
 * (positive velocity = dragging the sheet down/shorter), otherwise snaps to the
 * height closest to where the gesture ended. `snaps` must be ascending and
 * non-empty (as returned by `resolveSnapHeights`).
 */
export function nearestSnapHeight(
  snaps: readonly [number, ...number[]],
  currentHeight: number,
  velocity: number,
  velocityBias = 0.5,
): number {
  if (velocity > velocityBias) {
    const shorter = [...snaps].reverse().find((snap) => snap < currentHeight)
    if (shorter !== undefined) return shorter
  }
  if (velocity < -velocityBias) {
    const taller = snaps.find((snap) => snap > currentHeight)
    if (taller !== undefined) return taller
  }
  return snaps.reduce(
    (closest, snap) =>
      Math.abs(snap - currentHeight) < Math.abs(closest - currentHeight) ? snap : closest,
    snaps[0],
  )
}
