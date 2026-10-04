import type { HabitStatus } from './HabitRow'

export interface StatusRingProps {
  status?: HabitStatus
  size?: number
  trackColor?: string
  label: string
}
