import { loadAppFonts } from '@/__tests__/support/app-fonts'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('habit row standard in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([false, true])('transitions the painted surface on arrival and exit, selected=%s', async (selected) => {
    const mounted = render(<HabitRow habit={createMockHabit({ title: 'Read', description: 'Read two pages.' })}
      structuralColumn selectMode selected={selected} hasChildren actions={{ onToggleSelection: vi.fn() }} />)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'no-preference' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${tokens}}body{margin:0;padding:16px}</style>${markup}`)
      await page.bringToFront()
      const row = page.getByTestId('habit-row')
      const body = row.locator('[data-habit-row-body]')
      const point = await body.evaluate((element) => { const box = element.getBoundingClientRect(); return { x: box.x + 12, y: box.y + 12 } })
      const hoverBody = () => page.mouse.move(point.x, point.y)
      const rest = await rowPaint(row)
      const transition = await row.evaluate((element) => {
        const style = getComputedStyle(element)
        return { properties: style.transitionProperty, duration: style.transitionDuration, easing: style.transitionTimingFunction }
      })
      expect(transition).toEqual({ properties: 'background-color, box-shadow', duration: '0.38s, 0.38s', easing: 'cubic-bezier(0.2, 0, 0, 1), cubic-bezier(0.2, 0, 0, 1)' })
      const [arrival] = await Promise.all([sampleRowPaint(row), hoverBody()])
      const hover = await rowPaint(row)
      expect(hover.fill).not.toBe(rest.fill)
      expect(hover.outline).not.toBe(rest.outline)
      for (const property of ['fill', 'outline'] as const) {
        expect(arrival.some((paint) => paint[property] !== rest[property] && paint[property] !== hover[property])).toBe(true)
      }
      const [exit] = await Promise.all([sampleRowPaint(row), page.mouse.move(0, 0)])
      expect(await rowPaint(row)).toEqual(rest)
      for (const property of ['fill', 'outline'] as const) {
        expect(exit.some((paint) => paint[property] !== rest[property] && paint[property] !== hover[property])).toBe(true)
      }
      await hoverBody()
      await page.mouse.down()
      await page.evaluate(() => new Promise(requestAnimationFrame))
      expect(await rowPaint(row)).toEqual(hover)
      await row.locator('[data-habit-row-control="selection"]').hover()
      expect(await rowPaint(row)).toEqual(rest)
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await expect.poll(() => rowPaint(row)).toEqual(rest)
      for (const control of await row.locator('[data-habit-row-control]').all()) {
        await hoverBody()
        await expect.poll(() => rowPaint(row)).toEqual(hover)
        await control.hover()
        expect(await rowPaint(row)).toEqual(rest)
        await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(hover.fill)
        await page.mouse.down()
        expect(await rowPaint(row)).toEqual(rest)
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await hoverBody()
      expect(await rowPaint(row)).toEqual(hover)
      await page.mouse.move(0, 0)
      expect(await rowPaint(row)).toEqual(rest)
    } finally { await page.close() }
  })

  it('promotes only the body hairline on hover and press and restores it on exit', async () => {
    const mounted = render(<HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit: vi.fn() }} />)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${tokens}}</style>${markup}`)
      const row = page.getByTestId('habit-row')
      const outlines = await row.evaluate((element) => {
        const reference = document.createElement('span')
        element.append(reference)
        reference.style.transition = 'none'
        const outline = (token: string) => { reference.style.boxShadow = `inset 0 0 0 1px var(${token})`; return getComputedStyle(reference).boxShadow }
        const result = { rest: outline('--hairline'), active: outline('--hairline-strong') }
        reference.remove()
        return result
      })
      expect(outlines.active).not.toBe(outlines.rest)
      expect((await rowPaint(row)).outline).toBe(outlines.rest)
      for (let repeat = 0; repeat < 2; repeat++) {
        await row.locator('[data-habit-row-body]').hover()
        expect((await rowPaint(row)).outline).toBe(outlines.active)
        await page.mouse.down()
        expect((await rowPaint(row)).outline).toBe(outlines.active)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        expect((await rowPaint(row)).outline).toBe(outlines.rest)
      }
      await row.locator('[data-habit-row-control="menu"]').hover()
      expect((await rowPaint(row)).outline).toBe(outlines.rest)
    } finally { await page.close() }
  })

  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) =>
    [1, 2].map((scale) => ({ mode, width, scale })),
  )))('keeps the check and row geometry in $mode at $width with $scale text', async ({ mode, width, scale }) => {
    document.documentElement.style.fontSize = `${16 * scale}px`
    const mounted = render(<div className="habit-panel">
      {(['empty', 'done', 'overdue', 'bad'] as const).map((state) => <HabitRow key={state}
        habit={createMockHabit({ title: `Habit ${state}`, isBadHabit: state === 'bad' })} state={state} />)}
      <HabitRow habit={createMockHabit({ title: 'Child' })} depth={1} />
      <HabitRow habit={createMockHabit({ title: 'Empty parent' })} hasChildren childProgress={{ done: 0, total: 2 }} />
      <HabitRow habit={createMockHabit({ title: 'Partial parent' })} hasChildren childProgress={{ done: 1, total: 3 }} />
      <HabitRow habit={createMockHabit({ title: 'Complete parent' })} hasChildren childProgress={{ done: 3, total: 3 }} state="done" />
      <HabitRow habit={createMockHabit({ title: 'Selected' })} selectMode />
      <HabitRow habit={createMockHabit({ title: 'Unavailable' })} completionReadOnly completionStatusUnavailable />
    </div>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    document.documentElement.style.removeProperty('font-size')
    const page = await browser.newPage({ viewport: { width, height: 1500 } })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;padding:16px;background:var(--bg)}</style>${markup}`)
      await loadAppFonts(page)
      const expectedPaint = await page.evaluate(() => {
        const reference = document.createElement('span')
        reference.style.background = 'var(--bg-card)'
        reference.style.boxShadow = 'inset 0 0 0 1px var(--hairline)'
        document.body.append(reference)
        const paint = getComputedStyle(reference)
        const result = { fill: paint.backgroundColor, border: paint.boxShadow, track: '' }
        reference.style.boxShadow = 'inset 0 0 0 1px var(--track-empty)'
        result.track = getComputedStyle(reference).boxShadow
        reference.remove()
        return result
      })
      const rows = await page.locator('[data-testid="habit-row"]').evaluateAll((elements) => elements.map((row) => {
        const check = row.querySelector('[data-habit-check], [data-status]') as HTMLElement | null
        const paint = check && getComputedStyle(check)
        const body = getComputedStyle(row)
        const bounds = row.getBoundingClientRect()
        return { check: check && { width: check.getBoundingClientRect().width, height: check.getBoundingClientRect().height, radius: paint!.borderTopLeftRadius, border: paint!.boxShadow, background: paint!.backgroundColor }, radius: body.borderTopLeftRadius, layoutBorders: [body.borderTopWidth, body.borderRightWidth, body.borderBottomWidth, body.borderLeftWidth], border: body.boxShadow, background: body.backgroundColor, left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
      }))
      expect(rows).toHaveLength(10)
      const wellEdges = await page.locator('[data-testid="habit-row"]').evaluateAll((elements) => elements.map((row) => {
        const well = Array.from(row.querySelectorAll('span')).find((element) => {
          const style = getComputedStyle(element)
          return ['32px', '46px'].includes(style.width) && style.borderRadius === '12px'
        })!
        return well.getBoundingClientRect().left - row.getBoundingClientRect().left
      }))
      expect(wellEdges).toEqual([8, 8, 8, 8, 24, 8, 8, 8, 8, 8])
      for (const row of rows) {
        expect(row.check).toMatchObject({ width: 28, height: 28, radius: '12px' })
        expect(row.radius).toBe('20px')
        expect(row.layoutBorders).toEqual(['0px', '0px', '0px', '0px'])
        expect(row.border).toContain(expectedPaint.border)
        expect(row.background).toBe(expectedPaint.fill)
        expect(row.left).toBeGreaterThanOrEqual(16)
        expect(row.right).toBeLessThanOrEqual(width - 16)
      }
      expect(rows.slice(1).map((row, index) => row.top - rows[index]!.bottom)).toEqual(Array.from({ length: 9 }, () => 4))
      const emptyParent = page.locator('[data-habit-title="Empty parent"] [data-habit-row-control="check"]')
      expect(await emptyParent.getAttribute('aria-label')).toContain('0/2')
      expect(await emptyParent.locator('[data-habit-check] path').count()).toBe(0)
      expect(await emptyParent.locator('[data-habit-check]').evaluate((element) => getComputedStyle(element).boxShadow)).toBe(expectedPaint.track)
      const partial = await page.locator('[data-habit-title="Partial parent"] [data-habit-check] path').evaluate((element) => {
        const path = element as SVGPathElement
        return { perimeter: path.getTotalLength(), progress: Number.parseFloat(path.getAttribute('stroke-dasharray')!) }
      })
      expect(partial.progress / partial.perimeter).toBeCloseTo(1 / 3, 3)
      expect(await page.locator('[data-habit-title="Habit empty"] [data-personal-text]').evaluate((element) => getComputedStyle(element).fontSize)).toBe(`${17 * scale}px`)
      const toggle = page.getByRole('button', { name: 'habits.statusDot.empty, habits.logHabit: Habit empty', exact: true })
      await toggle.focus()
      const focus = await toggle.evaluate((element) => {
        const paint = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height, radius: paint.borderTopLeftRadius, outline: paint.outlineStyle, outlineWidth: paint.outlineWidth, offset: paint.outlineOffset,
          childOutlines: Array.from(element.querySelectorAll('*')).filter((child) => getComputedStyle(child).outlineStyle !== 'none').length }
      })
      expect(focus).toMatchObject({ width: 48, radius: '22px', outline: 'solid', outlineWidth: '2px', offset: '-10px', childOutlines: 0 })
      expect(focus.height).toBeGreaterThanOrEqual(48)
    } finally { await page.close() }
  })

  it.each((['light', 'dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) =>
    [1, 2].map((scale) => ({ mode, width, scale })),
  )))('measures preview, full-row feedback and centres in $mode at $width with $scale text', async ({ mode, width, scale }) => {
    document.documentElement.style.fontSize = `${16 * scale}px`
    const description = 'Read two pages before breakfast. '.repeat(12)
    const mounted = render(<div className="habit-panel">
      {[0, 1].flatMap((depth) => [false, true].flatMap((parent) => [false, true].flatMap((described) => [undefined, false, true].map((selected) =>
        <HabitRow key={`${depth}-${parent}-${described}-${selected}`} depth={depth as 0 | 1}
          selectMode={selected !== undefined} selected={selected}
          habit={createMockHabit({ title: 'Read ten minutes every morning', description: described ? description : null })}
          meta={['08:00']} hasChildren={parent} structuralColumn
          childProgress={parent ? { done: 1, total: 3 } : undefined}
          actions={{ onDetail: vi.fn(), onEdit: vi.fn(), onToggleExpand: vi.fn(), onToggleSelection: vi.fn() }} />,
      ))))}
    </div>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    document.documentElement.style.removeProperty('font-size')
    const page = await browser.newPage({ viewport: { width, height: 6000 } })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;padding:16px;background:var(--bg)}*{transition:none!important;animation:none!important}</style>${markup}`)
      await loadAppFonts(page)
      page.setDefaultTimeout(3000)
      const rows = page.locator('[data-testid="habit-row"]')
      for (let index = 0; index < 24; index++) {
        const row = rows.nth(index)
        const described = Math.floor(index / 3) % 2 === 1
        await assertPreviewRow(row, page, scale, described, Math.floor(index / 6) % 2 === 1)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    } finally { await page.close() }
  }, 30_000)

})

async function rowPaint(row: Locator) {
  return row.evaluate((element) => ({ fill: getComputedStyle(element).backgroundColor, outline: getComputedStyle(element).boxShadow.match(/rgba?\([^)]+\) [^,]*inset/u)?.[0] ?? 'none' }))
}

async function sampleRowPaint(row: Locator) {
  return row.evaluate(async (element) => {
    const samples: { fill: string; outline: string }[] = []
    const start = performance.now()
    do {
      samples.push({ fill: getComputedStyle(element).backgroundColor, outline: getComputedStyle(element).boxShadow.match(/rgba?\([^)]+\) [^,]*inset/u)?.[0] ?? 'none' })
      await new Promise(requestAnimationFrame)
    } while (performance.now() - start < 550)
    return samples
  })
}

async function assertPreviewRow(row: Locator, page: Page, scale: number, described: boolean, parent: boolean) {
  await assertPreviewColour(row, described, '--fg-3')
  const measured = await row.evaluate((element) => {
    const box = (node: Element) => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height, x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 } }
    const title = element.querySelector('[data-personal-text]')!
    const preview = element.querySelector('[data-habit-row-description]')
    const meta = element.querySelector('[data-habit-row-meta]')!
    const check = element.querySelector('[data-habit-check]')!
    let target = check.parentElement!
    while (target !== element && target.getBoundingClientRect().width !== 48) target = target.parentElement!
    return { row: box(element), title: box(title), titleSize: getComputedStyle(title).fontSize,
      preview: preview && { ...box(preview), size: getComputedStyle(preview).fontSize, weight: getComputedStyle(preview).fontWeight, family: getComputedStyle(preview).fontFamily, lineHeight: getComputedStyle(preview).lineHeight, clamp: getComputedStyle(preview).webkitLineClamp, ellipsis: getComputedStyle(preview).textOverflow, whiteSpace: getComputedStyle(preview).whiteSpace },
      meta: box(meta), check: box(check), glyph: check.querySelector('svg') ? box(check.querySelector('svg')!) : null, target: box(target),
      supporting: Boolean(element.querySelector('[data-habit-row-heading]')), depth: Number(element.getAttribute('data-depth')) }
  })
  expect(measured.titleSize).toBe(`${(measured.depth ? 14 : 17) * scale}px`)
  expect(measured.preview !== null).toBe(described)
  if (measured.preview) {
    expect(measured.preview.size).toBe(`${14 * scale}px`)
    expect(measured.preview.weight).toBe('400')
    expect(measured.preview.family).toContain('Geist')
    expect(Number.parseFloat(measured.preview.lineHeight)).toBeCloseTo(21.7 * scale, 1)
    expect(measured.row.bottom - measured.meta.bottom).toBeGreaterThanOrEqual(4)
    expect(measured.preview.top - measured.title.bottom).toBeCloseTo(4, 1)
    expect(measured.meta.top).toBeGreaterThanOrEqual(measured.preview.bottom + 3.9)
    expect(measured.preview.right).toBeLessThanOrEqual(measured.row.right - 8)
    expect(measured.preview.height).toBeCloseTo(21.7 * scale * (scale > 1.3 ? 2 : 1), 0)
    if (scale === 2) { expect(measured.preview.clamp).toBe('2'); expect(measured.preview.height).toBeGreaterThan(21.7 * scale + 1) }
    else expect(measured.preview).toMatchObject({ ellipsis: 'ellipsis', whiteSpace: 'nowrap' })
  }
  assertControlGeometry()
  function assertControlGeometry() {
    expect(Math.abs(measured.check.x - measured.target.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(measured.check.y - measured.target.y)).toBeLessThanOrEqual(1)
    if (scale === 1) expect(Math.abs(measured.target.y - measured.row.y)).toBeLessThanOrEqual(1)
    else expect(measured.target.top - measured.row.top).toBe(measured.depth ? 4 : 8)
    if (!described && !measured.supporting) expect(measured.meta.top - measured.title.bottom).toBeCloseTo(4, 1)
    expect(measured.meta.left - measured.title.left).toBeCloseTo(0, 1)
    expect(measured.supporting).toBe(scale === 2 && parent)
    if (scale === 2) expect(measured.target.top).toBeCloseTo(measured.title.top, 1)
    if (measured.glyph) {
      expect(Math.abs(measured.glyph.x - measured.check.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.glyph.y - measured.check.y)).toBeLessThanOrEqual(1)
    }
    expect(measured.target.width).toBe(48)
    expect(measured.target.height).toBeGreaterThanOrEqual(48)
  }
  await row.locator('[data-habit-row-body]').hover({ position: { x: 12, y: 12 } })
  const feedback = await row.evaluate((element) => ({ fill: getComputedStyle(element).backgroundColor,
    bodyFill: getComputedStyle(element.querySelector('[data-habit-row-body]')!).backgroundColor, radius: getComputedStyle(element).borderRadius }))
  await assertPreviewColour(row, described, '--fg-2')
  expect(feedback.radius).toBe('20px')
  expect(feedback.bodyFill).toBe('rgba(0, 0, 0, 0)')
  const expectedFill = await row.evaluate((element) => { const reference = document.createElement('span'); reference.style.background = 'var(--bg-hover)'; element.append(reference); const result = getComputedStyle(reference).backgroundColor; reference.remove(); return result })
  expect(feedback.fill).toBe(expectedFill)
  await page.mouse.down()
  expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
  await page.mouse.up()
  for (const control of await row.locator('[data-habit-row-control]').all()) {
    await control.hover()
    expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(expectedFill)
    expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
    await page.mouse.down()
    expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(expectedFill)
    await page.mouse.up()
  }
  await page.mouse.move(0, 0)
  await assertPreviewColour(row, described, '--fg-3')
  expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(expectedFill)
}

async function assertPreviewColour(row: Locator, described: boolean, token: string) {
  if (!described) return
  const expected = await row.evaluate((element, name) => {
    const reference = document.createElement('span')
    reference.style.color = `var(${name})`
    element.append(reference)
    const color = getComputedStyle(reference).color
    reference.remove()
    return color
  }, token)
  expect(await row.locator('[data-habit-row-description]').evaluate((element) => getComputedStyle(element).color)).toBe(expected)
}
