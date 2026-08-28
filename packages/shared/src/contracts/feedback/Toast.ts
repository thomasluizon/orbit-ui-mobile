import type { ReactElement } from 'react'

type ToastNeutralAction =
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: never; onAction?: never }

export type ToastProps =
  | ({
      kind: 'neutral'
      message: string
      icon?: ReactElement
      detail?: never
      doneAfterMs?: never
      onDone?: never
    } & ToastNeutralAction)
  | {
      kind: 'working'
      message: string
      icon?: never
      detail?: never
      actionLabel?: never
      onAction?: never
      doneAfterMs?: never
      onDone?: never
    }
  | {
      kind: 'done'
      message: string
      icon?: ReactElement
      doneAfterMs?: number
      onDone: () => void
      detail?: never
      actionLabel?: never
      onAction?: never
    }
  | {
      kind: 'lost'
      message: string
      detail: string
      actionLabel: string
      onAction: () => void
      icon?: ReactElement
      doneAfterMs?: never
      onDone?: never
    }
