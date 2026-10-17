export interface ChatThreadScroll {
  followLatest: (currentOffset?: number) => void
  isFollowing: () => boolean
  recordScroll: (offset: number, bottomOffset: number) => void
}

export function createChatThreadScroll(): ChatThreadScroll {
  let following = true
  let previousOffset: number | null = null

  return {
    followLatest: (currentOffset) => {
      following = true
      previousOffset = currentOffset ?? null
    },
    isFollowing: () => {
      return following
    },
    recordScroll: (offset, bottomOffset) => {
      if (previousOffset !== null && offset < previousOffset) following = false
      if (bottomOffset - offset <= 1) following = true
      previousOffset = offset
    },
  }
}
