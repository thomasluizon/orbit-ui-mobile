export function measureOnboardingProStep(root: HTMLElement) {
  const visible = (element: Element) => element.checkVisibility({ visibilityProperty: true })
  const wrappedActions = Array.from(root.querySelectorAll('a,button')).filter(visible).filter((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const lines = new Set<number>()
    let node = text.nextNode()
    while (node) {
      if (node.textContent?.trim()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rectangle of range.getClientRects()) lines.add(Math.round(rectangle.top))
      }
      node = text.nextNode()
    }
    return lines.size > 1
  }).map((element) => element.textContent.trim())
  const column = root.parentElement!.parentElement!.getBoundingClientRect()
  const main = root.closest('main')!
  const clientCenter = main.getBoundingClientRect().left + main.clientLeft + main.clientWidth / 2
  const horizontalOffset = Math.abs(column.x + column.width / 2 - clientCenter)
  const tiers = Array.from(root.querySelectorAll<HTMLElement>('[data-tier][data-tier-content]')).filter(visible).map((card) => {
    const bounds = card.getBoundingClientRect()
    const action = card.querySelector('button')!
    const button = action.getBoundingClientRect()
    const clone = card.cloneNode(true) as HTMLElement
    clone.style.width = `${bounds.width}px`
    clone.style.height = 'auto'
    clone.style.minHeight = '0'
    clone.style.position = 'absolute'
    card.parentElement!.append(clone)
    const contentHeight = clone.getBoundingClientRect().height
    clone.remove()
    return { interval: card.dataset.tierContent, height: bounds.height, contentHeight,
      belowButton: bounds.bottom - button.bottom, padding: parseFloat(getComputedStyle(card).paddingBottom) }
  })
  return { wrappedActions, horizontalOffset, tiers }
}
