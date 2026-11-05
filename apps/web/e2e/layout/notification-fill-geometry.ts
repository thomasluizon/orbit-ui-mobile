export function measureNotificationFill(row: Element) {
  const bounds = row.getBoundingClientRect()
  const probe = document.createElement('span')
  probe.style.backgroundColor = 'var(--bg-hover)'
  row.append(probe)
  const hoverColor = getComputedStyle(probe).backgroundColor
  probe.remove()
  const paints = [row, ...row.querySelectorAll('*')].flatMap((element) => {
    const box = element.getBoundingClientRect()
    return [null, '::before', '::after'].flatMap((pseudo) => {
      const style = getComputedStyle(element, pseudo)
      if (style.backgroundColor !== hoverColor || (pseudo && style.content === 'none')) return []
      const inset = (value: string) => Number.parseFloat(value) || 0
      return [{
        x: box.x + (pseudo ? inset(style.left) : 0),
        y: box.y + (pseudo ? inset(style.top) : 0),
        width: box.width - (pseudo ? inset(style.left) + inset(style.right) : 0),
        height: box.height - (pseudo ? inset(style.top) + inset(style.bottom) : 0),
        radius: style.borderTopLeftRadius,
      }]
    })
  })
  const bodyPaints = [...row.querySelectorAll('.orbit-list-row-body, .orbit-list-row-outset, .orbit-notification-row:not(.orbit-notification-delete)')].flatMap((element) =>
    [null, '::before', '::after'].flatMap((pseudo) => {
      const style = getComputedStyle(element, pseudo)
      if (pseudo && ['none', 'normal'].includes(style.content)) return []
      if (/^(transparent|rgba\([^)]*,\s*0\))$/.test(style.backgroundColor) && style.backgroundImage === 'none') return []
      return [{ background: style.backgroundColor, image: style.backgroundImage, pseudo }]
    }))
  return {
    row: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, radius: getComputedStyle(row).borderTopLeftRadius },
    fills: paints,
    bodyPaints,
  }
}
