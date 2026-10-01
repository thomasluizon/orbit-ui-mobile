export function measureOnboardingProStep(root: HTMLElement) {
  const visible = (element: Element) => element.checkVisibility({ visibilityProperty: true })
  const overflow = Array.from(root.querySelectorAll('p,h1,h2,h3,a,button')).filter(visible).filter((element) => element.scrollWidth > element.getBoundingClientRect().width + 0.5).map((element) => element.textContent.trim())
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
  const main = root.closest('main')!.getBoundingClientRect()
  const horizontalOffset = Math.abs(column.x + column.width / 2 - main.x - main.width / 2)
  return { overflow, wrappedActions, horizontalOffset }
}
