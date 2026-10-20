export function measureFieldInset(element: Element) {
  const field = element as HTMLInputElement | HTMLTextAreaElement
  const style = getComputedStyle(field)
  const box = field.getBoundingClientRect()
  const mirror = document.createElement('div')
  for (const property of style) mirror.style.setProperty(property, style.getPropertyValue(property))
  Object.assign(mirror.style, { position: 'fixed', inset: 'auto', left: `${box.left}px`, top: `${box.top}px`,
    width: `${box.width}px`, height: `${box.height}px`, margin: '0', visibility: 'hidden',
    pointerEvents: 'none', transform: 'none', whiteSpace: field.tagName === 'TEXTAREA' ? 'pre-wrap' : 'pre' })
  const text = document.createTextNode(field.value || field.placeholder || 'M')
  mirror.append(text)
  document.body.append(mirror)
  try {
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 1)
    const glyph = range.getBoundingClientRect()
    const rtl = style.direction === 'rtl'
    const pill = field.closest('[data-composer-input-row]')?.getBoundingClientRect()
    return {
      paddingStart: parseFloat(style.paddingInlineStart),
      paddingEnd: parseFloat(style.paddingInlineEnd),
      borderStart: parseFloat(style.borderInlineStartWidth),
      inset: rtl ? box.right - glyph.right : glyph.left - box.left,
      pillInset: pill ? rtl ? pill.right - glyph.right : glyph.left - pill.left : null,
      minimumHeight: parseFloat(style.minHeight),
      contentWidth: field.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd),
      height: field.clientHeight,
      scrollHeight: field.scrollHeight,
      lineHeight: parseFloat(style.lineHeight),
      maximumHeight: parseFloat(style.maxHeight),
    }
  } finally { mirror.remove() }
}
