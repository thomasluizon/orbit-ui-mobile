export function readControlPaint(element: Element) {
  for (const animation of element.getAnimations({ subtree: true })) {
    if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish()
  }
  const fill = element.querySelector('[data-press-fill]') ?? element
  const pseudo = fill === element ? ['::before', '::after'].find((layer) => {
    const paint = getComputedStyle(element, layer)
    return !['none', 'normal'].includes(paint.content) && paint.position === 'absolute'
      && !/^(transparent|rgba\([^)]*,\s*0\))$/.test(paint.backgroundColor)
  }) ?? null : null
  const style = getComputedStyle(fill, pseudo)
  const box = fill.getBoundingClientRect()
  const pixels = (value: string) => Number.parseFloat(value) || 0
  const bounds = pseudo
    ? { left: box.left + pixels(style.left), right: box.right - pixels(style.right), top: box.top + pixels(style.top), bottom: box.bottom - pixels(style.bottom) }
    : { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
  const controlBox = element.getBoundingClientRect()
  const control = { left: controlBox.left, right: controlBox.right, top: controlBox.top, bottom: controlBox.bottom }
  const target = { ...control }
  for (const layer of ['::before', '::after']) {
    const reach = getComputedStyle(element, layer)
    if (['none', 'normal'].includes(reach.content) || reach.position !== 'absolute') continue
    target.left = Math.min(target.left, control.left + pixels(reach.left))
    target.right = Math.max(target.right, control.right - pixels(reach.right))
    target.top = Math.min(target.top, control.top + pixels(reach.top))
    target.bottom = Math.max(target.bottom, control.bottom - pixels(reach.bottom))
  }
  let effectiveOpacity = pseudo ? Number(style.opacity) : 1
  for (let owner: Element | null = fill; owner; owner = owner.parentElement) effectiveOpacity *= Number(getComputedStyle(owner).opacity)
  const radius = (value: string) => Math.min(pixels(value), (bounds.right - bounds.left) / 2, (bounds.bottom - bounds.top) / 2)
  const controlStyle = getComputedStyle(element)
  return {
    background: style.backgroundColor, opacity: style.opacity, effectiveOpacity, bounds, control, target,
    reserveInline: element.matches('.orbit-list-row-shell .orbit-list-row-body, .orbit-list-row-column .orbit-list-row-body, .orbit-calendar-day-disclosure, .orbit-calendar-nav-control, .orbit-calendar-picker-control, .orbit-check-row-control'),
    reserveBlock: element.matches('.orbit-list-row-shell:not(.orbit-list-row-column) .orbit-list-row-body, .orbit-calendar-day-disclosure, .orbit-calendar-nav-control, .orbit-calendar-picker-control, .orbit-check-row-control, .orbit-check-row-label[data-variant="calendar-day"]'),
    radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(radius),
    controlRadii: [controlStyle.borderTopLeftRadius, controlStyle.borderTopRightRadius, controlStyle.borderBottomRightRadius, controlStyle.borderBottomLeftRadius].map(radius),
  }
}
