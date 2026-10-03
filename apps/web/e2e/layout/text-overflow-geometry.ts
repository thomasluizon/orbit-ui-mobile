export function measureTextOverflow(root: HTMLElement, selector = 'p,h1,h2,h3,a,button,span') {
  return Array.from(root.querySelectorAll(selector))
    .filter((element) => element.textContent.trim())
    .filter((element) => {
      const bounds = element.getBoundingClientRect()
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let left = Infinity
      let right = -Infinity
      let node = text.nextNode()
      while (node) {
        if (node.textContent?.trim()) {
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rectangle of range.getClientRects()) {
            left = Math.min(left, rectangle.left)
            right = Math.max(right, rectangle.right)
          }
        }
        node = text.nextNode()
      }
      return left < bounds.left - 0.5 || right > bounds.right + 0.5
    })
    .map((element) => element.textContent.trim())
}
