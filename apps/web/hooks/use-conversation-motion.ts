'use client'

import { resolveConversationMotion } from '@orbit/shared/theme'
import { useViewportMatch } from '@/hooks/use-viewport-match'

export function useConversationMotion(index = 0) {
  return resolveConversationMotion(useViewportMatch('(prefers-reduced-motion: reduce)'), index)
}
