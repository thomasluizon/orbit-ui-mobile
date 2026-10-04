export function measureScrollbarGutter(scroller: HTMLElement) {
  const style = getComputedStyle(scroller)
  return scroller.offsetWidth - scroller.clientWidth
    - Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth)
}
