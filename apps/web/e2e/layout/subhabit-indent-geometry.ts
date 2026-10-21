import { expect, type Locator, type Page } from '@playwright/test'
import { settleAnimations } from './settle-animations'

export async function setHabitTextScale(page: Page, scale: number, supportingTitles: readonly string[] = [], narrowSupportingTitles: readonly string[] = []) {
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
      rootFont: `${16 * scale}px`, rows: supportingTitles.map((title) => ({ title, headings: scale > 1.3 || narrowSupportingTitles.includes(title) ? 1 : 0 })),
    })
    await settleHabitRows(page.getByTestId('habit-row'), scale)
  } catch (cause) {
    throw new Error(`Habit text scale ${scale} did not settle: ${JSON.stringify(receipt)}`, { cause })
  } finally { await identities.dispose() }
}

function readHabitRowPhase(rows: Element[], { scale, selecting }: { scale: number; selecting?: boolean }) {
  const animations = rows.flatMap((row) => row.getAnimations({ subtree: true }))
    .filter((animation) => animation.pending || animation.playState === 'running' || animation.playState === 'paused')
    .map((animation) => {
      if (animation.effect?.getComputedTiming().endTime === Infinity) throw new Error('Habit rows have a nonterminating layout animation')
      return { property: animation instanceof CSSTransition ? animation.transitionProperty : null,
        playState: animation.playState, pending: animation.pending }
    })
  return {
    matching: getComputedStyle(document.documentElement).fontSize === `${16 * scale}px` && rows.every((row) => {
      const selections = row.querySelectorAll('[data-habit-row-control="selection"]').length
      const visualContents = row.querySelectorAll('[data-personal-text-content]').length
      return row.isConnected && row.querySelectorAll('[data-habit-row-heading]').length === (scale > 1.3 ? 1 : 0)
        && row.querySelectorAll('[data-personal-text]').length === 1
        && (selecting === undefined || selections === Number(selecting) && visualContents === Number(selecting))
    }),
    animations,
  }
}

export async function settleHabitRows(rows: Locator, scale: number, selecting?: boolean) {
  await expect.poll(async () => {
    const before = await rows.evaluateAll(readHabitRowPhase, { scale, selecting })
    if (!before.matching) return before
    if (before.animations.length > 0) await Promise.all((await rows.all()).map((row) => row.evaluate(settleAnimations)))
    await rows.page().evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    return rows.evaluateAll(readHabitRowPhase, { scale, selecting })
  }, { message: 'Habit row topology and owned layout animations must settle before geometry' })
    .toEqual({ matching: true, animations: [] })
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
  const geometry = {
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
  const readOwner = (node: Element) => {
    const style = getComputedStyle(node)
    return {
      tag: node.tagName, className: node.className, connected: node.isConnected,
      inlineStyle: node.getAttribute('style'), bounds: boundsOf(node),
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      position: style.position, top: style.top, left: style.left, transform: style.transform,
      width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth,
      flexBasis: style.flexBasis, flexGrow: style.flexGrow, flexShrink: style.flexShrink,
      alignItems: style.alignItems, alignSelf: style.alignSelf, overflow: style.overflow,
      padding: style.padding, margin: style.margin, boxSizing: style.boxSizing,
      gridColumn: style.gridColumn, gridRow: style.gridRow,
      gridTemplateColumns: style.gridTemplateColumns, gridTemplateRows: style.gridTemplateRows,
      transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration,
      animations: node.getAnimations().map((animation) => ({
        target: animation.effect instanceof KeyframeEffect && animation.effect.target instanceof Element
          ? animation.effect.target.tagName : null,
        property: animation instanceof CSSTransition ? animation.transitionProperty : null,
        playState: animation.playState, currentTime: String(animation.currentTime),
      })),
    }
  }
  const titleChain = []
  for (let node: Element | null = title; node; node = node.parentElement) {
    titleChain.push(readOwner(node))
    if (node === row) break
  }
  return {
    ...geometry,
    habitTitle: row.getAttribute('data-habit-title'), connected: row.isConnected,
    rootInlineFont: document.documentElement.style.fontSize,
    selection: Array.from(row.querySelectorAll('[data-habit-row-control="selection"]'))
      .map((node) => ({ pressed: node.getAttribute('aria-pressed'), ...readOwner(node) })),
    disclosures: Array.from(row.querySelectorAll('[data-habit-row-control="disclosure"]'))
      .map((node) => ({ expanded: node.getAttribute('aria-expanded'), ...readOwner(node) })),
    controlChains: Array.from(row.querySelectorAll('[data-habit-row-control]')).map((control) => {
      const chain = []
      for (let node: Element | null = control; node; node = node.parentElement) {
        chain.push(readOwner(node))
        if (node === row) break
      }
      return { control: control.getAttribute('data-habit-row-control'), chain }
    }),
    titleChain,
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

export async function assertHabitRows(rows: Locator, width: number, depths: number[], scale: number, selecting?: boolean) {
  await expect(rows).toHaveCount(depths.length)
  await settleHabitRows(rows, scale, selecting)
  const geometry = await Promise.all((await rows.all()).map((row) => row.evaluate(readHabitGeometry)))
  expect(geometry.map((row) => row.depth)).toEqual(depths)
  for (const row of geometry) {
    try { assertReadableHabit(row, width, scale) }
    catch (cause) {
      throw new Error(`${cause instanceof Error ? cause.message : String(cause)}\nHabit geometry: ${JSON.stringify({ width, scale, row })}`, { cause })
    }
  }
  expect(await rows.page().evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  return geometry
}
