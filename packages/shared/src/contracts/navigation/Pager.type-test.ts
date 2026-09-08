import type { ReactNode } from 'react'
import type { PagerProps } from './Pager'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? Exclude<keyof T, Keys<U>> extends never ? true : false : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type OwnForwardVariant = Extract<PagerProps, { forwardLabel: string }>
type ReplacedForwardVariant = Extract<PagerProps, { forwardSlot: ReactNode }>
type ExpectedOwnForwardVariant = {
  index: number
  count: number
  label: string
  backLabel: string
  onBack?: () => void
  forwardLabel: string
  onForward?: () => void
  forwardSlot?: never
}
type ExpectedReplacedForwardVariant = {
  index: number
  count: number
  label: string
  backLabel: string
  onBack?: () => void
  forwardSlot: ReactNode
  forwardLabel?: never
  onForward?: never
}

type Base = { index: 0; count: 3; label: 'Steps'; backLabel: 'Previous step' }
type OwnForward = Base & { forwardLabel: 'Continue' }
type ReplacedForward = Base & { forwardSlot: 'Finish' }
type ExpectedKeys = 'index' | 'count' | 'label' | 'backLabel' | 'onBack' | 'forwardLabel' | 'onForward' | 'forwardSlot'

export type PagerTypeContract = [
  Assert<IsExactWidth<Fields<OwnForwardVariant>, ExpectedOwnForwardVariant>>,
  Assert<IsExactWidth<Fields<ReplacedForwardVariant>, ExpectedReplacedForwardVariant>>,
  Assert<IsExactWidth<PagerProps['index'], number>>,
  Assert<IsExactWidth<PagerProps['count'], number>>,
  Assert<IsExactWidth<PagerProps['label'], string>>,
  Assert<IsExactWidth<PagerProps['backLabel'], string>>,
  Assert<IsExactWidth<PagerProps['onBack'], (() => void) | undefined>>,
  Assert<IsExactWidth<PagerProps['forwardLabel'], string | undefined>>,
  Assert<IsExactWidth<PagerProps['onForward'], (() => void) | undefined>>,
  Assert<IsExactWidth<PagerProps['forwardSlot'], ReactNode>>,
  Assert<IsExact<OwnForward, PagerProps>>,
  Assert<IsExact<OwnForward & { onForward: () => void }, PagerProps>>,
  Assert<IsExact<OwnForward & { onBack: () => void }, PagerProps>>,
  Assert<IsExact<OwnForward & { onBack: () => void; onForward: () => void }, PagerProps>>,
  Assert<IsExact<ReplacedForward, PagerProps>>,
  Assert<IsExact<ReplacedForward & { onBack: () => void }, PagerProps>>,
  Assert<Exclude<Keys<PagerProps>, ExpectedKeys> extends never ? true : false>,
  Assert<Exclude<ExpectedKeys, Keys<PagerProps>> extends never ? true : false>,
  // @ts-expect-error a replacement cannot relabel the owned forward control
  Assert<IsExact<ReplacedForward & { forwardLabel: 'Continue' }, PagerProps>>,
  // @ts-expect-error a replacement owns its forward handler
  Assert<IsExact<ReplacedForward & { onForward: () => void }, PagerProps>>,
  // @ts-expect-error the owned forward control requires the caller's words
  Assert<IsExact<Base, PagerProps>>,
  // @ts-expect-error pagers require a step count
  Assert<IsExact<Omit<OwnForward, 'count'>, PagerProps>>,
  // @ts-expect-error pagers require an accessible group name
  Assert<IsExact<Omit<OwnForward, 'label'>, PagerProps>>,
  // @ts-expect-error even an inert back control requires the caller's words
  Assert<IsExact<Omit<OwnForward, 'backLabel'>, PagerProps>>,
  // @ts-expect-error pagers require a current position
  Assert<IsExact<Omit<OwnForward, 'index'>, PagerProps>>,
]
