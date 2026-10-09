export function createChatThreadScroll() {
  let following = true
  let previousOffset: number | null = null

  return {
    followLatest() {
      following = true
      previousOffset = null
    },
    isFollowing() {
      return following
    },
    recordScroll(offset: number, bottomOffset: number) {
      if (previousOffset !== null && offset < previousOffset - 1) following = false
      if (bottomOffset - offset <= 1) following = true
      previousOffset = offset
    },
  }
}
