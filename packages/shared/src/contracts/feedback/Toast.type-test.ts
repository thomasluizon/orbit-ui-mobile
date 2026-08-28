import type { ReactElement } from 'react'
import type { ToastProps } from './Toast'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type Assert<T extends true> = T

declare const _icon: ReactElement

export type ToastTypeContract = [
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved' }, ToastProps>>,
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved'; actionLabel: 'Undo'; onAction: () => void }, ToastProps>>,
  Assert<IsExact<{ kind: 'working'; message: 'Saving' }, ToastProps>>,
  Assert<IsExact<{ kind: 'done'; message: 'Saved'; onDone: () => void }, ToastProps>>,
  Assert<IsExact<{ kind: 'lost'; message: 'Lost'; detail: 'Try again'; actionLabel: 'Retry'; onAction: () => void }, ToastProps>>,
  // @ts-expect-error kind is a closed four-value set
  Assert<IsExact<{ kind: 'warning'; message: 'Warning' }, ToastProps>>,
  // @ts-expect-error every toast requires a message
  Assert<IsExact<{ kind: 'neutral' }, ToastProps>>,
  // @ts-expect-error lost requires detail
  Assert<IsExact<{ kind: 'lost'; message: 'Lost'; actionLabel: 'Retry'; onAction: () => void }, ToastProps>>,
  // @ts-expect-error lost requires actionLabel
  Assert<IsExact<{ kind: 'lost'; message: 'Lost'; detail: 'Try again'; onAction: () => void }, ToastProps>>,
  // @ts-expect-error lost requires onAction
  Assert<IsExact<{ kind: 'lost'; message: 'Lost'; detail: 'Try again'; actionLabel: 'Retry' }, ToastProps>>,
  // @ts-expect-error neutral rejects detail
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved'; detail: 'No detail' }, ToastProps>>,
  // @ts-expect-error neutral rejects doneAfterMs
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved'; doneAfterMs: 5000 }, ToastProps>>,
  // @ts-expect-error neutral rejects onDone
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved'; onDone: () => void }, ToastProps>>,
  // @ts-expect-error neutral action label requires its handler
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved'; actionLabel: 'Undo' }, ToastProps>>,
  // @ts-expect-error neutral action handler requires its label
  Assert<IsExact<{ kind: 'neutral'; message: 'Saved'; onAction: () => void }, ToastProps>>,
  // @ts-expect-error working draws its own mark and rejects icons
  Assert<IsExact<{ kind: 'working'; message: 'Saving'; icon: typeof _icon }, ToastProps>>,
  // @ts-expect-error working rejects actionLabel
  Assert<IsExact<{ kind: 'working'; message: 'Saving'; actionLabel: 'Cancel' }, ToastProps>>,
  // @ts-expect-error working rejects onAction
  Assert<IsExact<{ kind: 'working'; message: 'Saving'; onAction: () => void }, ToastProps>>,
  // @ts-expect-error working rejects detail
  Assert<IsExact<{ kind: 'working'; message: 'Saving'; detail: 'Detail' }, ToastProps>>,
  // @ts-expect-error working rejects doneAfterMs
  Assert<IsExact<{ kind: 'working'; message: 'Saving'; doneAfterMs: 5000 }, ToastProps>>,
  // @ts-expect-error working rejects onDone
  Assert<IsExact<{ kind: 'working'; message: 'Saving'; onDone: () => void }, ToastProps>>,
  // @ts-expect-error done requires onDone
  Assert<IsExact<{ kind: 'done'; message: 'Saved' }, ToastProps>>,
  // @ts-expect-error done rejects actionLabel
  Assert<IsExact<{ kind: 'done'; message: 'Saved'; onDone: () => void; actionLabel: 'Undo' }, ToastProps>>,
  // @ts-expect-error done rejects onAction
  Assert<IsExact<{ kind: 'done'; message: 'Saved'; onDone: () => void; onAction: () => void }, ToastProps>>,
  // @ts-expect-error done rejects detail
  Assert<IsExact<{ kind: 'done'; message: 'Saved'; onDone: () => void; detail: 'Detail' }, ToastProps>>,
  // @ts-expect-error lost rejects doneAfterMs
  Assert<IsExact<{ kind: 'lost'; message: 'Lost'; detail: 'Try again'; actionLabel: 'Retry'; onAction: () => void; doneAfterMs: 5000 }, ToastProps>>,
  // @ts-expect-error lost rejects onDone
  Assert<IsExact<{ kind: 'lost'; message: 'Lost'; detail: 'Try again'; actionLabel: 'Retry'; onAction: () => void; onDone: () => void }, ToastProps>>,
]
