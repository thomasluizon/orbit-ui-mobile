import type { ReactElement } from 'react'
import type { ErrorStateProps } from './ErrorState'

type IsExact<T, U> = T extends U ? Exclude<keyof T, keyof U> extends never ? true : false : false
type Assert<T extends true> = T

declare const _action: ReactElement
declare const _actions: ReactElement[]

export type ErrorStateTypeContract = [
  Assert<IsExact<{ message: 'Try again' }, ErrorStateProps>>,
  Assert<IsExact<{ message: 'Try again'; action: typeof _action }, ErrorStateProps>>,
  // @ts-expect-error error message is required
  Assert<IsExact<{ action: typeof _action }, ErrorStateProps>>,
  // @ts-expect-error error codes cannot reach the surface
  Assert<IsExact<{ message: 'Try again'; code: 'E42' }, ErrorStateProps>>,
  // @ts-expect-error callers cannot set severity
  Assert<IsExact<{ message: 'Try again'; severity: 'high' }, ErrorStateProps>>,
  // @ts-expect-error callers cannot add error detail
  Assert<IsExact<{ message: 'Try again'; detail: 'Stack trace' }, ErrorStateProps>>,
  // @ts-expect-error action is one React element, never an array
  Assert<IsExact<{ message: 'Try again'; action: typeof _actions }, ErrorStateProps>>,
  // @ts-expect-error there is no plural actions slot
  Assert<IsExact<{ message: 'Try again'; actions: typeof _actions }, ErrorStateProps>>,
  // @ts-expect-error there is no secondary action slot
  Assert<IsExact<{ message: 'Try again'; secondaryAction: typeof _action }, ErrorStateProps>>,
]
