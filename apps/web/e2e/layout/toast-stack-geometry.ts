export function measureToastStack(slot: Element) {
  const slotBounds = slot.getBoundingClientRect()
  const surfaces = [...slot.querySelectorAll('[data-kind]')]
  function textCentre(element: Element) {
    const range = document.createRange()
    range.selectNodeContents(element)
    const bounds = range.getBoundingClientRect()
    return bounds.top + bounds.height / 2
  }
  return surfaces.map((surface, index) => {
    const bounds = surface.getBoundingClientRect()
    const message = surface.querySelector('[data-toast-message]')!
    const controls = [...surface.querySelectorAll('button')]
    const action = controls.length > 1 && controls[0]!.textContent.trim() ? controls[0]! : null
    const close = controls.at(-1)!.getBoundingClientRect()
    return {
      gap: index ? bounds.top - surfaces[index - 1]!.getBoundingClientRect().bottom : null,
      topInset: bounds.top - slotBounds.top,
      bottomInset: slotBounds.bottom - bounds.bottom,
      height: bounds.height,
      actionOffset: action ? textCentre(action) - textCentre(message) : null,
      closeOffset: close.top + close.height / 2 - textCentre(message),
    }
  })
}
