export interface ChatThreadScroll {
  followLatest: () => void
  isFollowing: () => boolean
  recordScroll: (offset: number, bottomOffset: number) => void
}

export function createChatThreadScroll(): ChatThreadScroll {
  let following = true
  let previousOffset: number | null = null

  return {
    followLatest: () => {
      following = true
    },
    isFollowing: () => {
      return following
    },
    recordScroll: (offset, bottomOffset) => {
      if (previousOffset !== null && offset < previousOffset - 1) following = false
      if (bottomOffset - offset <= 1) following = true
      previousOffset = offset
    },
  }
}
