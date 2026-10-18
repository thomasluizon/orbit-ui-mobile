import type { BarChartPoint, BarGeometry } from './BarChart'
import { resolveBarChartSelection, resolveBarChartGeometry, stepSelection } from './BarChart'

const point: BarChartPoint = { startDate: '2026-09-01', endDate: '2026-09-01', readoutDateLabel: 'Tue, Sep 1', dateLabel: 'Sep 1', rate: 50, scheduled: 2, completed: 1 }
const geometry: readonly BarGeometry[] = resolveBarChartGeometry([point.rate], 320)
const selected: number = resolveBarChartSelection([point], null)
const next: number = stepSelection(selected, geometry.length, 'right')
void next
