import { expect, type Locator, type Page } from '@playwright/test'

export const authoredLabelSelector = [
  'button:not([data-habit-row-body]):not(.orbit-list-row-body)',
  '[role="menuitem"]', '[role="tab"]', '[role="radio"]',
  '[data-slot="list-row-title"]', 'h1', 'h2', 'h3', 'label',
  '[data-state] > span', '[data-layout-label]',
].join(', ')

export async function markUserText(page: Page, values: readonly string[]) {
  for (const value of values) {
    await page.getByText(value, { exact: true }).evaluateAll((elements) => {
      for (const element of elements) element.setAttribute('data-layout-text-origin', 'user')
    })
  }
}

export async function markRequiredLabels(labels: Locator) {
  await expect(labels.first()).toBeVisible()
  expect(await labels.count(), 'required label inventory must not be empty').toBeGreaterThan(0)
  await labels.evaluateAll((elements) => {
    for (const element of elements) element.setAttribute('data-layout-label', '')
  })
}

export async function expectLabelsFit(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  const measurements = await page.locator(authoredLabelSelector).evaluateAll((elements) => {
    const nodes = new Set<Text>()
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) nodes.add(walker.currentNode as Text)
    }
    return [...nodes].flatMap((node) => {
      const owner = node.parentElement!
      if (!node.textContent.trim() || owner.closest('[data-layout-text-origin="user"], svg, [aria-hidden="true"]')) return []
      const style = getComputedStyle(owner)
      const bounds = owner.getBoundingClientRect()
      if (style.visibility === 'hidden' || !bounds.width || !bounds.height || bounds.width <= 1) return []
      const range = document.createRange()
      range.selectNodeContents(node)
      const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
      const lines = new Set(fragments.map((rect) => Math.round(rect.top)))
      let clipped = false
      let scrollsInline = false
      let scrollsBlock = false
      for (let ancestor: HTMLElement | null = owner; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor)
        const clip = ancestor.getBoundingClientRect()
        const clipsInline = !scrollsInline && ['hidden', 'clip'].includes(ancestorStyle.overflowX)
        const clipsBlock = !scrollsBlock && ['hidden', 'clip'].includes(ancestorStyle.overflowY)
        clipped ||= fragments.some((rect) =>
          (clipsInline && (rect.left < clip.left - 1 || rect.right > clip.right + 1))
          || (clipsBlock && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1)))
        scrollsInline ||= ['auto', 'scroll'].includes(ancestorStyle.overflowX)
        scrollsBlock ||= ['auto', 'scroll'].includes(ancestorStyle.overflowY)
      }
      const outsideOwner = fragments.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
      return [{ text: node.textContent.trim(), lines: lines.size, clipped: clipped || outsideOwner }]
    })
  })
  expect(measurements.length, 'the rendered surface has app-authored labels').toBeGreaterThan(0)
  expect.soft(measurements.filter((label) => label.lines > 1), 'app-authored labels must stay on one line').toEqual([])
  expect.soft(measurements.filter((label) => label.clipped), 'app-authored labels must remain whole, without ellipsis or clipping').toEqual([])
}

export async function expectLegendFits(legend: Locator) {
  await expect(legend).toBeVisible()
  await markRequiredLabels(legend.locator(':scope > span'))
  const rows = await legend.locator(':scope > span').evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  expect.soft(new Set(rows).size, 'legend items stay in one row or move behind disclosure').toBe(1)
}
