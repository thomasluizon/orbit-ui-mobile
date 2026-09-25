import type { BarChartPoint, BarGeometry } from './BarChart'
import { nearestBarIndex, resolveBarChartGeometry, stepSelection } from './BarChart'

const point: BarChartPoint = { dateLabel: 'Sep 1', rate: 50, scheduled: 2, completed: 1 }
const geometry: readonly BarGeometry[] = resolveBarChartGeometry([point.rate], 320)
const selected: number = nearestBarIndex(10, geometry)
const next: number = stepSelection(selected, geometry.length, 'right')
void next
