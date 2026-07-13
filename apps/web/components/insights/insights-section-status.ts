export type SectionStatus = 'loading' | 'error' | 'empty' | 'ready'

/**
 * Collapses react-query-style flags into a single render state, in priority
 * order: loading, then error, then empty, then ready.
 */
export function toSectionStatus(flags: {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
}): SectionStatus {
  if (flags.isLoading) return 'loading'
  if (flags.isError) return 'error'
  if (flags.isEmpty) return 'empty'
  return 'ready'
}
