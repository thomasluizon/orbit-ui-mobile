import { expect, type Locator, type Page } from '@playwright/test'

const logicalLabelSelector = [
  'button:not([data-habit-row-body]):not(.orbit-list-row-body)',
  '[role="menuitem"]', '[role="tab"]', '[role="radio"]',
  '[data-slot="list-row-title"]', '[data-slot="list-row-value"]', 'h1', 'h2', 'h3', 'label',
  '[data-habit-row-meta]',
  '[data-layout-label]', '[data-personal-text]',
].join(', ')

export const authoredLabelSelector = `${logicalLabelSelector}, [data-state] > span`

export async function markUserText(page: Page, values: readonly string[]) {
  await page.evaluate((fields) => {
    for (const element of document.querySelectorAll('[data-personal-text]')) {
      if (fields.includes(element.textContent.trim())) element.setAttribute('data-layout-text-origin', 'user')
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) {
      const owner = node.parentElement!
      if (owner.closest('[data-layout-text-origin="user"]')) continue
      const bounds = owner.getBoundingClientRect()
      if (owner.closest('svg, [aria-hidden="true"]') || getComputedStyle(owner).visibility !== 'visible'
        || !bounds.width || !bounds.height || bounds.width <= 1) continue
      const field = fields.find((value) => node.textContent.includes(value))
      if (!field) continue
      if (node.textContent.trim() === field) {
        owner.setAttribute('data-layout-text-origin', 'user')
        continue
      }
      const start = node.textContent.indexOf(field)
      const fieldNode = node.splitText(start)
      fieldNode.splitText(field.length)
      const mark = document.createElement('span')
      mark.setAttribute('data-layout-text-origin', 'user')
      fieldNode.replaceWith(mark)
      mark.append(fieldNode)
    }
  }, values)
}

export async function markRequiredLabels(labels: Locator) {
  await expect(labels.first()).toBeVisible()
  expect(await labels.count(), 'required label inventory must not be empty').toBeGreaterThan(0)
  await labels.evaluateAll((elements) => {
    for (const element of elements) element.setAttribute('data-layout-label', '')
  })
}

export async function expectLabelsFit(page: Page, surface: Page | Locator = page, requiredUserValues: readonly string[] = []) {
  await page.evaluate(() => document.fonts.ready)
  const measurements = await surface.locator(`${authoredLabelSelector}, [data-layout-text-origin="user"]`).evaluateAll((elements, selector) => {
    const nodes = new Set<Text>()
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) nodes.add(walker.currentNode as Text)
    }
    function measureNode(node: Text) {
      const owner = node.parentElement!
      const style = getComputedStyle(owner)
      const bounds = owner.getBoundingClientRect()
      if (style.visibility !== 'visible' || !bounds.width || !bounds.height || bounds.width <= 1) return null
      const range = document.createRange()
      range.selectNodeContents(node)
      const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
      let clipped = false
      let scrollsInline = false
      let scrollsBlock = false
      let ellipsized = false
      let visibleFragments = fragments
      for (let ancestor: HTMLElement | null = owner; ancestor; ancestor = ancestor.parentElement) {
        const ancestorStyle = getComputedStyle(ancestor)
        const clip = ancestor.getBoundingClientRect()
        const clipsInline = !scrollsInline && ['hidden', 'clip'].includes(ancestorStyle.overflowX)
        const clipsBlock = !scrollsBlock && ['hidden', 'clip'].includes(ancestorStyle.overflowY)
        const ancestorClips = fragments.some((rect) =>
          (clipsInline && (rect.left < clip.left - 1 || rect.right > clip.right + 1))
          || (clipsBlock && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1)))
        clipped ||= ancestorClips
        ellipsized ||= ancestorClips && (ancestorStyle.textOverflow === 'ellipsis' || Number.parseInt(ancestorStyle.webkitLineClamp) > 0)
        visibleFragments = visibleFragments.filter((rect) =>
          (!clipsInline || (rect.right > clip.left && rect.left < clip.right))
          && (!clipsBlock || (rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1)))
        scrollsInline ||= ['auto', 'scroll'].includes(ancestorStyle.overflowX)
        scrollsBlock ||= ['auto', 'scroll'].includes(ancestorStyle.overflowY)
      }
      const outsideOwner = fragments.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
      return { fragments, visibleFragments, clipped: clipped || outsideOwner, ellipsized }
    }
    function labelOwner(owner: Element) {
      const labelElement = owner.closest(selector) ?? owner.closest('[data-state] > span')!
      if (!labelElement.querySelector('[data-layout-text-origin="user"]')) return labelElement
      let metadata: Element = owner
      while (!metadata.parentElement!.querySelector('[data-layout-text-origin="user"]')) {
        metadata = metadata.parentElement!
      }
      return metadata
    }
    function countVisualLines(fragments: DOMRect[]) {
      const lines: DOMRect[] = []
      for (const fragment of [...fragments].sort((first, second) => first.top - second.top)) {
        const center = (fragment.top + fragment.bottom) / 2
        const sharesLine = lines.some((line) => {
          const lineCenter = (line.top + line.bottom) / 2
          return center >= line.top && center <= line.bottom
            && lineCenter >= fragment.top && lineCenter <= fragment.bottom
        })
        if (!sharesLine) lines.push(fragment)
      }
      return lines.length
    }
    function wordsBreakingAcrossLines(node: Text) {
      return [...node.textContent.matchAll(/\S+/gu)].filter((match) => {
        const word = document.createRange()
        word.setStart(node, match.index)
        word.setEnd(node, match.index + match[0].length)
        return countVisualLines([...word.getClientRects()].filter((rect) => rect.width > 0)) > 1
      }).map((match) => match[0])
    }
    const labels = new Map<Element, { text: string[]; fragments: DOMRect[]; clipped: boolean }>()
    const userText = new Map<Element, { text: string[]; fragments: DOMRect[]; clipped: boolean; ellipsized: boolean; brokenWords: string[] }>()
    for (const node of nodes) {
      const owner = node.parentElement!
      if (!node.textContent.trim() || owner.closest('svg, [aria-hidden="true"]')) continue
      const geometry = measureNode(node)
      if (!geometry) continue
      const userElement = owner.closest('[data-layout-text-origin="user"], [data-personal-text]')
      if (userElement) {
        const typed = userText.get(userElement) ?? { text: [], fragments: [], clipped: false, ellipsized: false, brokenWords: [] }
        typed.text.push(node.textContent.trim())
        typed.brokenWords.push(...wordsBreakingAcrossLines(node))
        typed.fragments.push(...geometry.visibleFragments)
        typed.clipped ||= geometry.clipped
        typed.ellipsized ||= geometry.ellipsized
        userText.set(userElement, typed)
        continue
      }
      const labelElement = labelOwner(owner)
      const label = labels.get(labelElement) ?? { text: [], fragments: [], clipped: false }
      label.text.push(node.textContent.trim())
      label.fragments.push(...geometry.fragments)
      label.clipped ||= geometry.clipped
      labels.set(labelElement, label)
    }
    return {
      labels: [...labels.values()].map((label) => ({ text: label.text.join(' '), lines: countVisualLines(label.fragments), clipped: label.clipped })),
      userText: [...userText.values()].map((typed) => ({ text: typed.text.join(' '), lines: countVisualLines(typed.fragments), clipped: typed.clipped, ellipsized: typed.ellipsized, brokenWords: typed.brokenWords })),
    }
  }, logicalLabelSelector)
  for (const value of requiredUserValues) {
    expect(measurements.userText.filter((typed) => typed.text === value && typed.lines > 0).length,
      `required user field must retain its rendered mark: ${value}`).toBeGreaterThan(0)
  }
  expect(measurements.labels.length, 'the rendered surface has app-authored labels').toBeGreaterThan(0)
  expect.soft(measurements.labels.filter((label) => label.lines > 1), 'app-authored labels must stay on one line').toEqual([])
  expect.soft(measurements.labels.filter((label) => label.clipped), 'app-authored labels must remain whole, without ellipsis or clipping').toEqual([])
  expect.soft(measurements.userText.filter((typed) => typed.brokenWords.length > 0), 'user text must never break inside a word or token').toEqual([])
  expect.soft(measurements.userText.filter((typed) => typed.lines > 2), 'user text must stay within two visible lines').toEqual([])
  expect.soft(measurements.userText.filter((typed) => typed.clipped && !typed.ellipsized), 'user text must use an ellipsis when clipped').toEqual([])
}

export async function expectLegendFits(legend: Locator, labels: readonly string[]) {
  await expect(legend).toBeVisible()
  expect(labels.length, 'required legend inventory must not be empty').toBeGreaterThan(0)
  for (const label of labels) await markRequiredLabels(legend.getByText(label, { exact: true }))
  await expectLabelsFit(legend.page(), legend)
}
