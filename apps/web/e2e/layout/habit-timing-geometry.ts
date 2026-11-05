export function readReminderChipGeometry(element: Element) {
  const target = element.getBoundingClientRect()
  const chipElement = element.closest('[data-reminder-chip]')!
  const chip = chipElement.getBoundingClientRect()
  const dialog = element.closest('[role="dialog"]')!
  let clipTop = 0
  let clipBottom = innerHeight
  let clipLeft = 0
  let clipRight = innerWidth
  for (let ancestor: Element | null = chipElement; ancestor && dialog.contains(ancestor); ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor)
    const bounds = ancestor.getBoundingClientRect()
    if (style.overflowY !== 'visible') {
      clipTop = Math.max(clipTop, bounds.top)
      clipBottom = Math.min(clipBottom, bounds.bottom)
    }
    if (style.overflowX !== 'visible') {
      clipLeft = Math.max(clipLeft, bounds.left)
      clipRight = Math.min(clipRight, bounds.right)
    }
  }
  const frame = element.closest('fieldset')!.getBoundingClientRect()
  return {
    left: target.left - chip.left,
    right: chip.right - target.right,
    top: target.top - chip.top,
    bottom: chip.bottom - target.bottom,
    clipped: chip.top < clipTop - 1 || chip.bottom > clipBottom + 1 || chip.left < clipLeft - 1 || chip.right > clipRight + 1,
    fits: chip.left >= frame.left - 1 && chip.right <= frame.right + 1,
  }
}
