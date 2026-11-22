'use client'
import { type RecapSharePeriod } from '@orbit/shared/utils'
import { GuidedWrappedCover } from './guided-wrapped-cover'

type WrappedCoverState = 'ready' | 'loading' | 'failed' | 'empty'

export interface WrappedCoverProps {
  period: RecapSharePeriod
  onSelectPeriod: (period: RecapSharePeriod) => void
  state: WrappedCoverState
  onStart: () => void
  onRetry: () => void
}

/** The cover of the Wrapped route. */
export function WrappedCover(props: Readonly<WrappedCoverProps>) {
  return <GuidedWrappedCover {...props} />
}
