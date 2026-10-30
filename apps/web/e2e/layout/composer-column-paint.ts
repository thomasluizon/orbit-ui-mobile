export function measureChromePaint(element: HTMLElement) {
  const clip = element.closest<HTMLElement>('[data-shell-notice], [data-shell-pinned-slot], [data-shell-fab-clip]')
  if (!clip) throw new Error('Bottom chrome clip missing')
  const bounds = element.getBoundingClientRect()
  const clipBounds = clip.getBoundingClientRect()
  const style = getComputedStyle(element)
  const extent = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const shadow of style.boxShadow.replace(/rgba?\([^)]*\)/g, '').split(',')) {
    if (shadow.includes('inset') || shadow.trim() === 'none') continue
    const [offsetX, offsetY, blur = 0, spread = 0] = shadow.match(/-?[\d.]+px/g)?.map(parseFloat) ?? []
    if (offsetX === undefined || offsetY === undefined) throw new Error('Unresolved chrome shadow')
    extent.top = Math.max(extent.top, blur + spread - offsetY)
    extent.right = Math.max(extent.right, blur + spread + offsetX)
    extent.bottom = Math.max(extent.bottom, blur + spread + offsetY)
    extent.left = Math.max(extent.left, blur + spread - offsetX)
  }
  const outline = style.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset))
  for (const side of ['top', 'right', 'bottom', 'left'] as const) extent[side] = Math.max(extent[side], outline)
  const clipLeft = clipBounds.left + clip.clientLeft
  const clipTop = clipBounds.top + clip.clientTop
  return {
    extent,
    clearance: {
      top: bounds.top - clipTop,
      right: clipLeft + clip.clientWidth - bounds.right,
      bottom: clipTop + clip.clientHeight - bounds.bottom,
      left: bounds.left - clipLeft,
    },
    shadow: style.boxShadow,
    outlineWidth: parseFloat(style.outlineWidth),
    clipPointerEvents: getComputedStyle(clip).pointerEvents,
    hit: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
  }
}

export function composerPlaceholderFits(element: Element, scale: number) {
  const input = element as HTMLTextAreaElement
  const style = getComputedStyle(input)
  const singleLineHeight = parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const contentWidth = input.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd)
  const contentHeight = input.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  const placeholderStyle = getComputedStyle(input, '::placeholder')
  const mirror = document.createElement('div')
  Object.assign(mirror.style, { position: 'fixed', top: '0', left: '0', width: `${contentWidth}px`,
    font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
    whiteSpace: placeholderStyle.whiteSpace, overflowWrap: placeholderStyle.overflowWrap, pointerEvents: 'none', opacity: '0' })
  mirror.textContent = input.placeholder
  document.body.append(mirror)
  const range = document.createRange()
  range.selectNodeContents(mirror)
  const contentBox = mirror.getBoundingClientRect()
  const ink = [...range.getClientRects()].filter(line => line.width > 0)
  const placeholderFits = input.placeholder.length > 0 && ink.length > 0
    && ink.every(line => line.left >= contentBox.left - 1 && line.right <= contentBox.right + 1
      && line.top >= contentBox.top - 1 && line.bottom <= contentBox.top + contentHeight + 1)
    && (scale !== 1 || contentBox.height <= parseFloat(style.lineHeight) + 1)
  mirror.remove()
  const row = input.closest('[data-composer-input-row]')!
  const pill = row.getBoundingClientRect()
  const trailing = row.querySelector('[data-composer-trailing-controls]')!
  const items = [...row.children].flatMap(child => child === trailing ? [...child.children] : [child])
    .map(child => child.getBoundingClientRect()).filter(bounds => bounds.width > 0 && bounds.height > 0)
  const lines: { top: number; bottom: number; items: DOMRect[] }[] = []
  for (const item of items) {
    const line = lines.at(-1)
    if (line && Math.max(line.top, item.top) < Math.min(line.bottom, item.bottom)) {
      line.top = Math.max(line.top, item.top)
      line.bottom = Math.min(line.bottom, item.bottom)
      line.items.push(item)
    } else lines.push({ top: item.top, bottom: item.bottom, items: [item] })
  }
  const linesFit = lines.length > 0 && lines.every((line, index) => {
    const bottoms = line.items.map(item => item.bottom)
    const top = Math.min(...line.items.map(item => item.top))
    return Math.max(...bottoms) - Math.min(...bottoms) <= 1
      && (index === 0 || top >= Math.max(...lines[index - 1]!.items.map(item => item.bottom)))
      && line.items.every((item, position) => item.left >= pill.left && item.right <= pill.right
        && item.top >= pill.top && item.bottom <= pill.bottom
        && (position === 0 || item.left >= line.items[position - 1]!.right))
  }) && Math.abs(Math.max(...lines.at(-1)!.items.map(item => item.bottom)) - pill.bottom + 8) <= 1
  const inputBounds = input.getBoundingClientRect()
  const inputLine = lines.find(line => Math.max(line.top, inputBounds.top) < Math.min(line.bottom, inputBounds.bottom))
  const inputFits = inputLine && Math.abs(inputBounds.bottom - inputLine.bottom) <= 1
    && inputBounds.left >= pill.left + 8 && inputBounds.right <= pill.right - 8
    && inputBounds.top >= pill.top + 8 && inputBounds.bottom <= pill.bottom - 8
  const controls = [...row.querySelectorAll('button')].map(button => button.getBoundingClientRect())
  const controlsFit = controls.every((control, index) => control.width >= 48 && control.height >= 48
    && control.left >= pill.left && control.right <= pill.right && control.top >= pill.top && control.bottom <= pill.bottom
    && lines.some(line => Math.max(line.top, control.top) < Math.min(line.bottom, control.bottom) && Math.abs(control.bottom - line.bottom) <= 1)
    && (control.right <= inputBounds.left || control.left >= inputBounds.right || control.bottom <= inputBounds.top || control.top >= inputBounds.bottom)
    && (index === 0 || control.left >= controls[index - 1]!.right + 8 || control.top >= controls[index - 1]!.bottom + 8))
  return Math.abs(parseFloat(style.fontSize) - 16 * scale) < 0.5 && placeholderFits
    && input.scrollWidth <= input.clientWidth && input.scrollHeight <= input.clientHeight
    && (scale !== 1 || Math.abs(input.clientHeight - singleLineHeight) <= 1)
    && pill.height >= 56 && pill.height >= input.clientHeight + 16 && linesFit && controlsFit && Boolean(inputFits)
}
