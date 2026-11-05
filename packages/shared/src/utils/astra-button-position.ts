export const ASTRA_BUTTON_SIZE = 60
export const ASTRA_BUTTON_GAP = 16
export const ASTRA_DRAG_THRESHOLD = 8
export const ASTRA_POSITION_KEY = 'orbit-astra-button-position'

export interface AstraButtonPoint { x: number; y: number }
export interface AstraButtonArea { width: number; height: number }
export interface AstraButtonObstacle extends AstraButtonPoint, AstraButtonArea {}
export type AstraMoveDirection = 'left' | 'right' | 'up' | 'down'

export function parseAstraButtonPosition(stored: string | null): AstraButtonPoint | null {
  if (!stored) return null
  try {
    const point: unknown = JSON.parse(stored)
    if (typeof point !== 'object' || point === null || !('x' in point) || !('y' in point)) return null
    return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y)
      ? { x: point.x, y: point.y } : null
  } catch {
    return null
  }
}

export function clampAstraButton(point: AstraButtonPoint, area: AstraButtonArea): AstraButtonPoint {
  const maximumX = Math.max(ASTRA_BUTTON_GAP, area.width - ASTRA_BUTTON_SIZE - ASTRA_BUTTON_GAP)
  const maximumY = Math.max(ASTRA_BUTTON_GAP, area.height - ASTRA_BUTTON_SIZE - ASTRA_BUTTON_GAP)
  return { x: Math.max(ASTRA_BUTTON_GAP, Math.min(maximumX, point.x)), y: Math.max(ASTRA_BUTTON_GAP, Math.min(maximumY, point.y)) }
}

function overlaps(point: AstraButtonPoint, obstacle: AstraButtonObstacle) {
  return point.x < obstacle.x + obstacle.width + ASTRA_BUTTON_GAP && point.x + ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP > obstacle.x
    && point.y < obstacle.y + obstacle.height + ASTRA_BUTTON_GAP && point.y + ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP > obstacle.y
}

export function snapAstraButton(requested: AstraButtonPoint | null, area: AstraButtonArea, obstacles: readonly AstraButtonObstacle[]): AstraButtonPoint | null {
  if (area.width < ASTRA_BUTTON_SIZE + 2 * ASTRA_BUTTON_GAP || area.height < ASTRA_BUTTON_SIZE + 2 * ASTRA_BUTTON_GAP) return null
  const maximum = clampAstraButton({ x: area.width, y: area.height }, area)
  const fits = requested && requested.x <= maximum.x && requested.y <= maximum.y
  const point = fits ? clampAstraButton(requested, area) : { x: maximum.x, y: maximum.y - ASTRA_BUTTON_SIZE - ASTRA_BUTTON_GAP }
  const heights = [point.y, ASTRA_BUTTON_GAP, maximum.y, ...obstacles.flatMap(obstacle => [obstacle.y - ASTRA_BUTTON_SIZE - ASTRA_BUTTON_GAP, obstacle.y + obstacle.height + ASTRA_BUTTON_GAP])]
  const candidates = [ASTRA_BUTTON_GAP, maximum.x].flatMap(x => heights.map(y => clampAstraButton({ x, y }, area)))
    .filter(candidate => !obstacles.some(obstacle => overlaps(candidate, obstacle)))
  candidates.sort((first, second) => Math.abs(first.x - point.x) + Math.abs(first.y - point.y) - Math.abs(second.x - point.x) - Math.abs(second.y - point.y))
  return candidates[0] ?? null
}

export function moveAstraButton(point: AstraButtonPoint, direction: AstraMoveDirection, area: AstraButtonArea): AstraButtonPoint {
  const step = ASTRA_BUTTON_SIZE + ASTRA_BUTTON_GAP
  return clampAstraButton({ x: direction === 'left' ? ASTRA_BUTTON_GAP : direction === 'right' ? area.width : point.x,
    y: point.y + (direction === 'up' ? -step : direction === 'down' ? step : 0) }, area)
}
