import type { ReactElement } from 'react'
import type { CapacityNoticeProps } from './CapacityNotice'

type IsExact<T, U> = T extends U ? Exclude<keyof T, keyof U> extends never ? true : false : false
type Assert<T extends true> = T

declare const _action: ReactElement
declare const _actions: ReactElement[]

export type CapacityNoticeTypeContract = [
  Assert<IsExact<{ message: 'Limit reached' }, CapacityNoticeProps>>,
  Assert<IsExact<{ message: 'Limit reached'; body: 'Try tomorrow'; action: typeof _action }, CapacityNoticeProps>>,
  // @ts-expect-error capacity message is required
  Assert<IsExact<{ body: 'Try tomorrow' }, CapacityNoticeProps>>,
  // @ts-expect-error boundaries have no variant
  Assert<IsExact<{ message: 'Limit reached'; variant: 'error' }, CapacityNoticeProps>>,
  // @ts-expect-error boundaries have no severity
  Assert<IsExact<{ message: 'Limit reached'; severity: 'high' }, CapacityNoticeProps>>,
  // @ts-expect-error boundaries have no status
  Assert<IsExact<{ message: 'Limit reached'; status: 'bad' }, CapacityNoticeProps>>,
  // @ts-expect-error boundaries have no tone
  Assert<IsExact<{ message: 'Limit reached'; tone: 'bad' }, CapacityNoticeProps>>,
  // @ts-expect-error action is one React element, never an array
  Assert<IsExact<{ message: 'Limit reached'; action: typeof _actions }, CapacityNoticeProps>>,
  // @ts-expect-error there is no plural actions slot
  Assert<IsExact<{ message: 'Limit reached'; actions: typeof _actions }, CapacityNoticeProps>>,
  // @ts-expect-error there is no upgrade action slot
  Assert<IsExact<{ message: 'Limit reached'; upgradeAction: typeof _action }, CapacityNoticeProps>>,
]
