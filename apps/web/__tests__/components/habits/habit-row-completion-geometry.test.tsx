import { assertCompletionFill, compileHabitRowStylesheet, completionPaint, rowPaint, sampleRowPaint } from '@/__tests__/support/habit-row-standard-geometry'
import { render } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('habit row standard in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    stylesheet = await compileHabitRowStylesheet()
  })
  afterAll(async () => { vi.unstubAllGlobals(); await closeChrome(browserLaunch) }, 30_000)

  // WHY: Independent pages overlap animation waits; DOM renders finish before the first await. https://github.com/thomasluizon/orbit-tickets/issues/1693
  it.concurrent.for((['light', 'dark'] as const).flatMap((mode) => [320, 412, 1352].flatMap((width) =>
    [1, 2].flatMap((scale) => [false, true].flatMap((parent) => (['reduce', 'no-preference'] as const).map((motion) => ({ mode, width, scale, parent, motion })))),
  )))('contains completion feedback in $mode at $width with $scale text, parent=$parent motion=$motion', async ({ mode, width, scale, parent, motion }, { expect }) => {
    document.documentElement.style.fontSize = `${16 * scale}px`
    const mounted = render(<div className="habit-panel">
      {(['empty', 'done', 'overdue', 'bad'] as const).map((state) => <HabitRow key={state} state={state}
        habit={createMockHabit({ title: 'Read', description: 'Read two pages.', isBadHabit: state === 'bad' })}
        hasChildren={parent} childProgress={parent ? { done: state === 'done' ? 3 : 1, total: 3 } : undefined}
        actions={{ onEdit: vi.fn(), onLog: vi.fn() }} />)}
    </div>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    document.documentElement.style.removeProperty('font-size')
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: motion })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;padding:16px}</style>${markup}`)
      await page.bringToFront()
      for (const control of await page.locator('[data-habit-row-control="check"]').all()) {
        await page.mouse.move(0, 0)
        await control.evaluate((element) => (element as HTMLElement).blur())
        const restingFeedback = await completionPaint(control)
        const border = await control.locator('[data-habit-check]').evaluate((element) => getComputedStyle(element).boxShadow)
        await control.hover()
        await expect.poll(() => completionPaint(control)).not.toBe('rgba(0, 0, 0, 0)')
        await assertCompletionFill(control, scale, 1, expect)
        expect(await control.locator('[data-habit-check]').evaluate((element) => getComputedStyle(element).boxShadow)).toBe(border)
        const progress = control.locator('svg path[stroke-dasharray]')
        if (await progress.count()) expect(await progress.getAttribute('stroke')).toBe(await control.locator('[data-habit-check]').getAttribute('data-status') === 'bad' ? 'var(--status-bad)' : 'var(--primary)')
        await page.mouse.down()
        const pressScale = motion === 'reduce' ? 1 : 0.96
        await expect.poll(() => control.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(48 * pressScale, 1)
        await assertCompletionFill(control, scale, pressScale, expect)
        await page.mouse.up()
        await page.mouse.move(0, 0)
        await expect.poll(() => completionPaint(control)).toBe(restingFeedback)
        await page.keyboard.press('Tab')
        await control.focus()
        const rings = await control.evaluate((element) => [element, ...element.querySelectorAll('*')]
          .map((part) => getComputedStyle(part)).filter((style) => style.outlineStyle !== 'none' && style.outlineColor !== 'rgba(0, 0, 0, 0)')
          .map((style) => ({ width: style.width, radius: style.borderRadius, offset: style.outlineOffset })))
        expect(rings).toEqual([{ width: '28px', radius: '12px', offset: '2px' }])
      }
    } finally { await page.close() }
  })

  it.concurrent.for((['light', 'dark'] as const).flatMap((mode) => [false, true].flatMap((parent) =>
    (['reduce', 'no-preference'] as const).map((motion) => ({ mode, parent, motion })),
  )))('paints completion on press without hover in $mode, parent=$parent motion=$motion', async ({ mode, parent, motion }, { expect }) => {
    const mounted = render(<>{(['empty', 'done', 'overdue', 'bad'] as const).map((state) => <HabitRow key={state} state={state}
      habit={createMockHabit({ title: 'Read', description: 'Read two pages.', isBadHabit: state === 'bad' })}
      hasChildren={parent} childProgress={parent ? { done: state === 'done' ? 3 : 1, total: 3 } : undefined}
      actions={{ onEdit: vi.fn(), onLog: vi.fn() }} />)}</>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: motion, hasTouch: true })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${tokens}}body{margin:0;padding:16px}</style>${markup}`)
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false)
      for (const control of await page.locator('[data-habit-row-control="check"]').all()) {
        const rest = await completionPaint(control)
        await control.hover()
        expect(await completionPaint(control)).toBe(rest)
        await page.mouse.down()
        const pressScale = motion === 'reduce' ? 1 : 0.96
        await expect.poll(() => control.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(48 * pressScale, 1)
        await assertCompletionFill(control, 1, pressScale, expect)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        await expect.poll(() => completionPaint(control)).toBe(rest)
      }
    } finally { await page.close() }
  })

  it.each(['light', 'dark'] as const)('keeps disabled and selection status checks unpainted in %s', async (mode) => {
    const mounted = render(<>{[false, true].flatMap((parent) => [false, true].flatMap((done) =>
      (['disabled', 'read-only', 'selection'] as const).map((kind) => <HabitRow key={`${parent}-${done}-${kind}`}
        habit={createMockHabit({ title: 'Read', isCompleted: done })} state={done ? 'done' : 'empty'}
        hasChildren={parent} childProgress={parent ? { done: done ? 3 : 1, total: 3 } : undefined}
        completionReadOnly={kind !== 'selection'} completionReason={kind === 'read-only' ? 'Read only' : undefined}
        selectMode={kind === 'selection'} />)))}</>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    const page = await browser.newPage({ viewport: { width: 412, height: 1500 }, reducedMotion: 'reduce' })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${tokens}}body{margin:0;padding:16px}</style>${markup}`)
      for (const check of await page.locator('[data-habit-check]').all()) {
        const paint = () => check.evaluate((element) => [element, ...element.querySelectorAll('*')].map((part) => ({ background: getComputedStyle(part).backgroundColor, border: getComputedStyle(part).boxShadow })))
        const rest = await paint()
        const bounds = await check.boundingBox()
        await page.mouse.move(bounds!.x + 14, bounds!.y + 14)
        expect(await paint()).toEqual(rest)
        await page.mouse.down()
        expect(await paint()).toEqual(rest)
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
    } finally { await page.close() }
  })

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
      await expect.poll(() => rowPaint(row)).toEqual(rest)
      for (const property of ['fill', 'outline'] as const) {
        expect(exit.some((paint) => paint[property] !== rest[property] && paint[property] !== hover[property])).toBe(true)
      }
      await hoverBody()
      await page.mouse.down()
      await expect.poll(() => rowPaint(row)).toEqual(hover)
      await row.locator('[data-habit-row-control="selection"]').hover()
      await expect.poll(() => rowPaint(row)).toEqual(rest)
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await expect.poll(() => rowPaint(row)).toEqual(rest)
      for (const control of await row.locator('[data-habit-row-control]').all()) {
        await hoverBody()
        await expect.poll(() => rowPaint(row)).toEqual(hover)
        await control.hover()
        await expect.poll(() => rowPaint(row)).toEqual(rest)
        await expect.poll(() => control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(hover.fill)
        await page.mouse.down()
        await expect.poll(() => rowPaint(row)).toEqual(rest)
        await page.mouse.move(0, 0)
        await page.mouse.up()
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await hoverBody()
      await expect.poll(() => rowPaint(row)).toEqual(hover)
      await page.mouse.move(0, 0)
      await expect.poll(() => rowPaint(row)).toEqual(rest)
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
      await expect.poll(async () => (await rowPaint(row)).outline).toBe(outlines.rest)
      for (let repeat = 0; repeat < 2; repeat++) {
        await row.locator('[data-habit-row-body]').hover()
        await expect.poll(async () => (await rowPaint(row)).outline).toBe(outlines.active)
        await page.mouse.down()
        await expect.poll(async () => (await rowPaint(row)).outline).toBe(outlines.active)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        await expect.poll(async () => (await rowPaint(row)).outline).toBe(outlines.rest)
      }
      await row.locator('[data-habit-row-control="menu"]').hover()
      await expect.poll(async () => (await rowPaint(row)).outline).toBe(outlines.rest)
    } finally { await page.close() }
  })
})
