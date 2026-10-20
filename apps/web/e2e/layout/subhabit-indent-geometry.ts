import { expect, type Locator, type Page } from '@playwright/test'

export async function setHabitTextScale(page: Page, scale: number, supportingTitles: readonly string[] = []) {
  const identities = await page.evaluateHandle(() => {
    const nodes = [document.documentElement, ...document.querySelectorAll('[data-testid="habit-row"]')]
    return { root: document.documentElement, nodes: new Map(nodes.map((node, index) => [node, index + 1])) }
  })
  let receipt: unknown
  try {
    await page.evaluate(async (scale) => {
      document.documentElement.style.fontSize = `${16 * scale}px`
      await document.fonts.ready
    }, scale)
    await expect.poll(() => page.locator('html').evaluate((root) => getComputedStyle(root).fontSize), {
      message: 'Actual root font must match before the existing resize signal',
    }).toBe(`${16 * scale}px`)
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('resize'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    })
    await expect.poll(async () => {
      const actual = await page.evaluate(({ identities, supportingTitles }) => {
        const identify = (node: Element) => {
          if (!identities.nodes.has(node)) identities.nodes.set(node, identities.nodes.size + 1)
          return identities.nodes.get(node)!
        }
        const root = document.documentElement
        return {
          root: { id: identify(root), initialConnected: identities.root.isConnected,
            inlineFont: root.style.fontSize, computedFont: getComputedStyle(root).fontSize },
          observedRows: Array.from(identities.nodes).filter(([node]) =>
            supportingTitles.includes(node.getAttribute('data-habit-title')!))
            .map(([node, id]) => ({ id, connected: node.isConnected })),
          rows: Array.from(document.querySelectorAll('[data-testid="habit-row"]'))
            .filter((row) => supportingTitles.includes(row.getAttribute('data-habit-title')!))
            .map((row) => ({ id: identify(row), title: row.getAttribute('data-habit-title'),
              connected: row.isConnected, headings: row.querySelectorAll('[data-habit-row-heading]').length })),
        }
      }, { identities, supportingTitles })
      receipt = actual
      return { rootFont: actual.root.computedFont, rows: actual.rows.map(({ title, headings }) => ({ title, headings })) }
    }, { message: 'Habit text scale and supporting phases must settle together' }).toEqual({
      rootFont: `${16 * scale}px`, rows: supportingTitles.map((title) => ({ title, headings: scale > 1.3 ? 1 : 0 })),
    })
  } catch (cause) {
    throw new Error(`Habit text scale ${scale} did not settle: ${JSON.stringify(receipt)}`, { cause })
  } finally { await identities.dispose() }
}

function readHabitGeometry(row: HTMLElement) {
  const boundsOf = (element: Element) => {
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
    return { left, right, top, bottom, width, height }
  }
  const title = row.querySelector<HTMLElement>('[data-personal-text]')!
  const titleStyle = getComputedStyle(title)
  const well = Array.from(row.querySelectorAll('span')).find((element) => {
    const style = getComputedStyle(element)
    return ['32px', '46px'].includes(style.width) && style.borderRadius === '12px'
  })!
  const metadata = row.querySelector('[data-habit-row-meta]')
  const titleBounds = boundsOf(title)
  const range = document.createRange()
  range.selectNodeContents(title)
  const visibleFragments = [...range.getClientRects()].filter((rect) =>
    rect.width > 0 && rect.height > 0 && rect.left < titleBounds.right && rect.right > titleBounds.left
    && rect.top < titleBounds.bottom && rect.bottom > titleBounds.top)
  return {
    rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
    depth: Number(row.getAttribute('data-depth')),
    bounds: boundsOf(row), well: boundsOf(well), title: titleBounds,
    fontSize: parseFloat(titleStyle.fontSize), lineHeight: parseFloat(titleStyle.lineHeight),
    visibleFragments: visibleFragments.length,
    metadata: metadata ? boundsOf(metadata) : null,
    supporting: row.querySelector('[data-habit-row-heading]') !== null,
    overflow: row.scrollWidth - row.clientWidth,
    targets: Array.from(row.querySelectorAll('[data-habit-row-control]')).map(boundsOf),
    checks: Array.from(row.querySelectorAll('[data-habit-check]')).map(boundsOf),
  }
}

function assertReadableHabit(row: ReturnType<typeof readHabitGeometry>, width: number, scale: number) {
  expect(row.rootFontSize, 'Habit geometry root font must match the requested scale').toBe(16 * scale)
  expect(row.well.left - row.bounds.left).toBe(8 + 16 * row.depth)
  expect(row.title.left - row.well.left).toBe(60)
  expect(row.title.width).toBeGreaterThanOrEqual(row.fontSize)
  expect(row.title.height).toBeGreaterThanOrEqual(row.lineHeight - 1)
  expect(row.visibleFragments).toBeGreaterThan(0)
  expect(row.overflow).toBeLessThanOrEqual(1)
  expect(row.bounds.left).toBeGreaterThanOrEqual(0)
  expect(row.bounds.right).toBeLessThanOrEqual(width)
  for (const target of row.targets) {
    expect(target.width).toBeGreaterThanOrEqual(48)
    expect(target.height).toBeGreaterThanOrEqual(48)
    expect(target.left).toBeGreaterThanOrEqual(row.bounds.left)
    expect(target.right).toBeLessThanOrEqual(row.bounds.right)
  }
  const overlaps = (first: typeof row.title, second: typeof row.title) =>
    Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0.5
    && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0.5
  for (const target of [...row.targets, ...row.checks]) expect(overlaps(row.title, target)).toBe(false)
  for (const [index, target] of row.targets.entries()) {
    for (const neighbor of row.targets.slice(index + 1)) expect(overlaps(target, neighbor)).toBe(false)
  }
  if (row.metadata) {
    expect(row.metadata.width).toBeGreaterThan(0)
    expect(row.metadata.left).toBe(row.title.left)
    expect(row.metadata.top).toBeGreaterThanOrEqual(row.title.bottom)
  }
}

export async function assertHabitRows(rows: Locator, width: number, depths: number[], scale: number) {
  await expect(rows).toHaveCount(depths.length)
  const geometry = await Promise.all((await rows.all()).map((row) => row.evaluate(readHabitGeometry)))
  expect(geometry.map((row) => row.depth)).toEqual(depths)
  for (const row of geometry) assertReadableHabit(row, width, scale)
  expect(await rows.page().evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  return geometry
}
