export function createGoalDragGesture(
  pointerType: string,
  startX: number,
  startY: number,
  onActivate: () => void,
): {
  pointerType: string
  cancel: () => void
  isActive: () => boolean
  suppressPress: () => boolean
  move: (x: number, y: number) => void
} {
  let active = false
  let cancelled = false
  let suppressPress = false
  const activate = () => {
    if (cancelled || active) return
    active = true
    suppressPress = true
    onActivate()
  }
  const timer = pointerType === 'touch' ? setTimeout(activate, 300) : undefined
  const cancel = () => { cancelled = true; clearTimeout(timer) }
  return {
    pointerType,
    cancel,
    isActive: () => active && !cancelled,
    suppressPress: () => suppressPress,
    move: (x: number, y: number) => {
      if (cancelled || active) return
      const distance = Math.hypot(x - startX, y - startY)
      if (pointerType === 'touch' && distance > 5) {
        suppressPress = true
        cancel()
      } else if (pointerType !== 'touch' && distance > 5) activate()
    },
  }
}
