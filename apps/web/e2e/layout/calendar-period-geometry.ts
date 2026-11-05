export async function readCalendarPeriodGeometry(row: Element, settle = true) {
  const measure = () => {
    const title = row.querySelector('[data-calendar-period-title]')!
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right, center: (box.top + box.bottom) / 2 }
    }
    return {
      label: bounds(title),
      chevrons: [...row.querySelectorAll('button')].filter(button => button !== title).map(bounds),
    }
  }
  if (!settle) return measure()
  await document.fonts.ready
  const animations = new Set<Animation>()
  for (let element: Element | null = row; element; element = element.parentElement) {
    for (const animation of element.getAnimations({ subtree: element === row })) animations.add(animation)
  }
  await Promise.allSettled([...animations].map(animation => animation.finished))
  let previous = measure()
  let stableFrames = 0
  for (let frame = 0; frame < 60 && stableFrames < 2; frame++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const current = measure()
    stableFrames = JSON.stringify(current) === JSON.stringify(previous) ? stableFrames + 1 : 0
    previous = current
  }
  if (stableFrames < 2) throw new Error('Calendar period geometry did not settle')
  return previous
}
