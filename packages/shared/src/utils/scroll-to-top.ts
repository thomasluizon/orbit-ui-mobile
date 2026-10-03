export interface ScrollToTopState {
  offset: number
  visible: boolean
}

export function updateScrollToTopState(previous: ScrollToTopState, offset: number, viewportHeight: number): ScrollToTopState {
  return {
    offset,
    visible: viewportHeight > 0 && offset > viewportHeight &&
      (offset < previous.offset || (offset === previous.offset && previous.visible)),
  }
}
