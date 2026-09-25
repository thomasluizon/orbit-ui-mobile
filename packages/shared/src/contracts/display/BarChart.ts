export type BarChartPoint = Readonly<{
  dateLabel: string
  rate: number | null
  scheduled: number
  completed: number
}>

export type BarGeometry = Readonly<{
  x: number
  y: number
  width: number
  height: number
  radius: number
  slotStart: number
  slotEnd: number
}>

export const BAR_CHART_HEIGHT = 96
export const BAR_CHART_EMPTY_HEIGHT = 4

export function resolveBarChartGeometry(
  rates: readonly (number | null)[],
  width: number,
): readonly BarGeometry[] {
  if (rates.length === 0 || width <= 0) return []
  const slotWidth = width / rates.length
  const gap = Math.min(8, Math.max(0, slotWidth - 2))
  const barWidth = slotWidth - gap

  return rates.map((rate, index) => {
    const height = rate == null || rate <= 0
      ? BAR_CHART_EMPTY_HEIGHT
      : Math.max(BAR_CHART_EMPTY_HEIGHT, Math.min(100, rate) / 100 * BAR_CHART_HEIGHT)
    const slotStart = index * slotWidth
    return {
      x: slotStart + gap / 2,
      y: BAR_CHART_HEIGHT - height,
      width: barWidth,
      height,
      radius: Math.min(8, height / 2),
      slotStart,
      slotEnd: (index + 1) * slotWidth,
    }
  })
}

export function nearestBarIndex(x: number, bars: readonly BarGeometry[]): number {
  if (bars.length === 0) return -1
  const slotWidth = bars[0]!.slotEnd - bars[0]!.slotStart
  return Math.max(0, Math.min(bars.length - 1, Math.floor(x / slotWidth)))
}

export function barChartPath(bar: BarGeometry): string {
  const { x, y, width, height, radius } = bar
  return `M ${x} ${y + height} V ${y + radius} Q ${x} ${y} ${x + radius} ${y} H ${x + width - radius} Q ${x + width} ${y} ${x + width} ${y + radius} V ${y + height} Z`
}

export function stepSelection(
  index: number,
  count: number,
  direction: 'left' | 'right' | 'home' | 'end',
): number {
  if (count === 0) return -1
  if (direction === 'home') return 0
  if (direction === 'end') return count - 1
  return Math.max(0, Math.min(count - 1, index + (direction === 'left' ? -1 : 1)))
}
