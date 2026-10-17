import type { BlockFrameProps } from '../contracts/blocks'

type ReadQueryState = Readonly<{
  isPending: boolean
  isError: boolean
  isRefetchError: boolean
}>

export function liveBlockState(query: ReadQueryState, options: Readonly<{
  acting?: boolean
  failed?: boolean
  stale?: boolean
  staleMessage: string
  onRefresh: () => void
}>): (Pick<Extract<BlockFrameProps, { state: 'stale' }>, 'state' | 'staleMessage' | 'onRefresh'> | { state: 'loading' | 'resting' | 'acting' | 'partiallyFailed' }) {
  if (options.acting) return { state: 'acting' }
  if (query.isRefetchError || options.stale) return { state: 'stale', staleMessage: options.staleMessage, onRefresh: options.onRefresh }
  if (query.isError || options.failed) return { state: 'partiallyFailed' }
  return { state: query.isPending ? 'loading' : 'resting' }
}
