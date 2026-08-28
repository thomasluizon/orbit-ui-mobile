import type { ReactElement } from 'react'
import type { EmptyStateProps } from './EmptyState'

type IsExact<T, U> = T extends U ? Exclude<keyof T, keyof U> extends never ? true : false : false
type Assert<T extends true> = T

declare const _action: ReactElement
declare const _actions: ReactElement[]

export type EmptyStateTypeContract = [
  Assert<IsExact<{ title: 'Nothing here' }, EmptyStateProps>>,
  Assert<IsExact<{ title: 'Ask Astra'; mark: 'astra'; action: typeof _action }, EmptyStateProps>>,
  // @ts-expect-error empty state title is required
  Assert<IsExact<{ action: typeof _action }, EmptyStateProps>>,
  // @ts-expect-error the satellite is not an identity carrier
  Assert<IsExact<{ title: 'Nothing here'; mark: 'satellite' }, EmptyStateProps>>,
  // @ts-expect-error action is one React element, never an array
  Assert<IsExact<{ title: 'Nothing here'; action: typeof _actions }, EmptyStateProps>>,
  // @ts-expect-error there is no plural actions slot
  Assert<IsExact<{ title: 'Nothing here'; actions: typeof _actions }, EmptyStateProps>>,
  // @ts-expect-error there is no secondary action slot
  Assert<IsExact<{ title: 'Nothing here'; secondaryAction: typeof _action }, EmptyStateProps>>,
]
