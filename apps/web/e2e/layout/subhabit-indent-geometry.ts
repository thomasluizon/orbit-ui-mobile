import { expect, type Locator, type Page } from '@playwright/test'

export async function setHabitTextScale(page: Page, scale: number) {
  await page.evaluate(async (scale) => {
    document.documentElement.style.fontSize = `${16 * scale}px`
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    window.dispatchEvent(new Event('resize'))
  }, scale)
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

function assertReadableHabit(row: ReturnType<typeof readHabitGeometry>, width: number) {
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

export async function assertHabitRows(rows: Locator, width: number, depths: number[]) {
  await expect(rows).toHaveCount(depths.length)
  const geometry = await Promise.all((await rows.all()).map((row) => row.evaluate(readHabitGeometry)))
  expect(geometry.map((row) => row.depth)).toEqual(depths)
  for (const row of geometry) assertReadableHabit(row, width)
  expect(await rows.page().evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  return geometry
}
