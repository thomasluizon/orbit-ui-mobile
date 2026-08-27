import type { ReactNode } from 'react'

export type HabitStatus = 'empty' | 'done' | 'overdue' | 'bad'

export interface HabitRowBase {
  icon?: string
  title: string
  meta?: string
  status?: HabitStatus
  depth?: 0 | 1
  compact?: boolean
  onClick?: () => void
}

export type HabitRowTrailing =
  | {
      trailing: ReactNode
      statusLabel?: never
      onLog?: never
      logLabel?: never
    }
  | {
      trailing?: never
      statusLabel: string
      onLog: () => void
      logLabel: string
    }
  | {
      trailing?: never
      statusLabel: string
      onLog?: never
      logLabel?: never
    }

export type HabitRowMenu =
  | { onMenu: () => void; menuLabel: string }
  | { onMenu?: never; menuLabel?: never }

export type HabitRowProps = HabitRowBase & HabitRowTrailing & HabitRowMenu
