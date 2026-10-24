import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import type { Browser } from '@/__tests__/support/chromium'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { expect, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const geometryLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'pt-BR' }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => {
  const messages = geometryLocale.value === 'en' ? en : ptBR
  return key === 'habits.rowTypeTask' ? messages.habits.rowTypeTask : key === 'habits.form.typeTask' ? messages.habits.form.typeTask : key === 'habits.form.typeHabit' ? messages.habits.form.typeHabit : key
} }))

export { geometryLocale }

export async function compileHabitRowStylesheet() {
  const source = resolve('app/globals.css')
  return (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
}

export async function assertHabitRowPreviewGeometry(browser: Browser, stylesheet: string, { mode, width, scale, locale }: {
  mode: 'light' | 'dark'; width: number; scale: number; locale: 'en' | 'pt-BR'
}) {
  geometryLocale.value = locale
  const observations = new Map<Element, { callback: ResizeObserverCallback; observer: ResizeObserver }>()
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { observations.set(target, { callback: this.callback, observer: this }) }
    unobserve(target: Element) { observations.delete(target) }
    disconnect() {
      for (const [target, observation] of observations) if (observation.observer === this) observations.delete(target)
    }
  })
  vi.stubGlobal('innerWidth', width)
  document.documentElement.style.fontSize = `${16 * scale}px`
  const description = 'Read two pages before breakfast. '.repeat(12)
  const mounted = render(<div className="habit-panel">
    {[0, 1, 2].flatMap((depth) => [false, true].flatMap((parent) => [false, true].flatMap((described) => [undefined, false, true].map((selected) =>
      <HabitRow key={`${depth}-${parent}-${described}-${selected}`} depth={depth}
        selectMode={selected !== undefined} selected={selected}
        habit={createMockHabit({ title: 'Read ten minutes every morning', description: described ? description : parent ? ' \n ' : null, frequencyUnit: selected === false ? null : 'Day' })}
        meta={['08:00']} hasChildren={parent} structuralColumn
        childProgress={parent ? { done: 1, total: 3 } : undefined}
        actions={{ onDetail: vi.fn(), onEdit: vi.fn(), onToggleExpand: vi.fn(), onToggleSelection: vi.fn() }} />,
    ))))}
  </div>)
  const page = await browser.newPage({ viewport: { width, height: 6000 } })
  try {
    const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const styles = `<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;padding:16px;background:var(--bg)}*{transition:none!important;animation:none!important}</style>`
    await page.setContent(`${styles}${mounted.container.innerHTML}`)
    const observed = await page.getByTestId('habit-row').evaluateAll((elements) => Promise.all(elements.map((target) => new Promise<{
      contentRect: DOMRectInit; borderBoxSize: ResizeObserverSize[]; contentBoxSize: ResizeObserverSize[]; devicePixelContentBoxSize: ResizeObserverSize[]
    }>((resolve) => {
      const observer = new ResizeObserver(([entry]) => {
        const sizes = (boxes: readonly ResizeObserverSize[]) => boxes.map(({ inlineSize, blockSize }) => ({ inlineSize, blockSize }))
        resolve({ contentRect: entry!.contentRect.toJSON(), borderBoxSize: sizes(entry!.borderBoxSize), contentBoxSize: sizes(entry!.contentBoxSize), devicePixelContentBoxSize: sizes(entry!.devicePixelContentBoxSize) })
        observer.disconnect()
      })
      observer.observe(target)
    }))))
    act(() => mounted.container.querySelectorAll('[data-testid="habit-row"]').forEach((target, index) => {
      const observation = observations.get(target)!
      const entry = observed[index]!
      observation.callback([{ ...entry, contentRect: DOMRectReadOnly.fromRect(entry.contentRect), target }], observation.observer)
    }))
    await page.setContent(`${styles}${mounted.container.innerHTML}`)
    await loadAppFonts(page)
    page.setDefaultTimeout(3000)
    const rows = page.locator('[data-testid="habit-row"]')
    const rowCount = await rows.count()
    expect(rowCount).toBe(36)
    for (let index = 0; index < rowCount; index++) {
      const row = rows.nth(index)
      const described = Math.floor(index / 3) % 2 === 1
      const messages = locale === 'en' ? en : ptBR
      await assertPreviewRow(row, page, scale, described, index % 3 === 1 ? messages.habits.rowTypeTask : messages.habits.form.typeHabit)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  } finally {
    mounted.unmount()
    document.documentElement.style.removeProperty('font-size')
    vi.unstubAllGlobals()
    await page.close()
  }
}

export async function assertHydratedMetadataRow(row: Locator, { width, scale, locale, index, selecting }: { width: number; scale: number; locale: 'en' | 'pt-BR'; index: number; selecting: boolean }) {
  const measured = await measurePreviewRow(row)
  const supporting = scale > 1.3 || (width === 320 && index === 3)
  expect(measured.supporting).toBe(supporting)
  expect(measured.typeCount).toBe(1)
  expect(measured.type.text).toBe(locale === 'en' ? en.habits.form.typeHabit : ptBR.habits.form.typeHabit)
  expect(measured.type.left).toBeCloseTo(measured.title.left, 1)
  const checklist = row.locator('[data-habit-row-checklist]')
  expect(await checklist.textContent()).toBe('50/50')
  expect(await checklist.locator('svg').getAttribute('width')).toBe(scale > 1.3 ? '24' : '16')
  const bounds = await checklist.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const text = document.createRange(); text.selectNodeContents(element.querySelector('span')!)
    const count = text.getBoundingClientRect()
    const strip = element.closest('[data-habit-row-meta]')!.getBoundingClientRect()
    return { left: box.left, right: box.right, stripLeft: strip.left, stripRight: strip.right, countHeight: count.height }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.stripLeft)
  expect(bounds.right).toBeLessThanOrEqual(bounds.stripRight + 1)
  expect(bounds.countHeight).toBeLessThanOrEqual(16.8 * scale + 1)
  expect(Math.abs(measured.check.x - measured.target.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(measured.check.y - measured.target.y)).toBeLessThanOrEqual(1)
  if (supporting) expect(measured.target.top).toBeCloseTo(measured.title.top, 1)
  else expect(Math.abs(measured.target.y - measured.row.y)).toBeLessThanOrEqual(1)
  expect(measured.check).toMatchObject({ width: 28, height: 28 })
  expect(measured.target.width).toBe(48)
  expect(measured.target.height).toBeGreaterThanOrEqual(48)
  const name = await row.locator('[data-habit-row-body]').getAttribute('aria-label')
  expect(name!.split(locale === 'en' ? 'Checklist, 50 of 50' : 'Checklist, 50 de 50')).toHaveLength(2)
  expect(await row.locator('[data-habit-row-control="selection"]').count()).toBe(selecting ? 1 : 0)
}

export async function rowPaint(row: Locator) {
  return row.evaluate((element) => ({ fill: getComputedStyle(element).backgroundColor, outline: getComputedStyle(element).boxShadow.match(/rgba?\([^)]+\) [^,]*inset/u)?.[0] ?? 'none' }))
}

export async function sampleRowPaint(row: Locator) {
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

async function measurePreviewRow(row: Locator) {
  return row.evaluate((element) => {
    const box = (node: Element | Range) => { const b = node.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height, x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 } }
    const title = element.querySelector('[data-personal-text]')!
    const preview = element.querySelector('[data-habit-row-description]')
    const type = element.querySelector<HTMLElement>('[data-habit-row-type]')!
    const typeStyle = getComputedStyle(type)
    const typeText = document.createRange()
    typeText.selectNodeContents(type)
    const typeLines = Array.from(typeText.getClientRects(), (rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }))
    const wordLineCounts = Array.from(type.textContent!.matchAll(/\S+/gu), (match) => {
      const word = typeText.cloneRange()
      word.setStart(type.firstChild!, match.index)
      word.setEnd(type.firstChild!, match.index + match[0].length)
      return Array.from(word.getClientRects()).filter((rect) => rect.width > 0).length
    })
    const paintedControls = Array.from(element.querySelectorAll('[data-habit-row-control]')).flatMap((control) => {
      const style = getComputedStyle(control)
      const painted = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent' || style.boxShadow !== 'none'
      return (painted ? [control] : Array.from(control.querySelectorAll('[data-habit-check], svg'))).filter((node) => {
        for (let owner: Element | null = node; owner; owner = owner.parentElement) {
          const paint = getComputedStyle(owner)
          if (paint.display === 'none' || paint.visibility === 'hidden' || Number(paint.opacity) === 0) return false
        }
        return node.getBoundingClientRect().width > 0
      }).map(box)
    })
    const heading = element.querySelector('[data-habit-row-heading]')
    const meta = element.querySelector('[data-habit-row-meta]')!
    const check = element.querySelector('[data-habit-check]')!
    let target = check.parentElement!
    while (target !== element && target.getBoundingClientRect().width !== 48) target = target.parentElement!
    const reference = document.createElement('span')
    element.append(reference)
    const tokenPaint = (property: 'color' | 'background', token: string) => {
      reference.style[property] = `var(${token})`
      return getComputedStyle(reference)[property === 'background' ? 'backgroundColor' : 'color']
    }
    const expectedFill = tokenPaint('background', '--bg-hover')
    const descriptionRest = tokenPaint('color', '--fg-3')
    const descriptionHover = tokenPaint('color', '--fg-2')
    reference.remove()
    const bodyPaint = getComputedStyle(element.querySelector('[data-habit-row-body]')!)
    return { rowFill: getComputedStyle(element).backgroundColor, bodyFill: bodyPaint.backgroundColor, radius: getComputedStyle(element).borderRadius,
      expectedFill, descriptionRest, descriptionHover, descriptionColour: preview && getComputedStyle(preview).color,
      controlFills: Array.from(element.querySelectorAll('[data-habit-row-control]'), control => {
        const fill = control.querySelector('[data-habit-row-check-fill]') ?? control.querySelector('[data-habit-check-feedback]') ?? control.querySelector('[data-habit-check]') ?? control
        return getComputedStyle(fill).backgroundColor
      }),
      row: box(element), title: box(title), titleSize: getComputedStyle(title).fontSize,
      body: box(element.querySelector('[data-habit-row-body]')!), typeLines, wordLineCounts, paintedControls,
      content: box(title.parentElement!), footerContent: heading ? box(type.closest('[data-habit-row-meta]')!.parentElement!) : null,
      typeCount: element.querySelectorAll('[data-habit-row-type]').length, typeInHeading: Boolean(heading?.contains(type)),
      type: { ...box(type), text: type.textContent, ink: box(typeText), overflow: typeStyle.textOverflow, whiteSpace: typeStyle.whiteSpace, clamp: typeStyle.webkitLineClamp, clientWidth: type.clientWidth, scrollWidth: type.scrollWidth, clientHeight: type.clientHeight, scrollHeight: type.scrollHeight },
      preview: preview && { ...box(preview), size: getComputedStyle(preview).fontSize, weight: getComputedStyle(preview).fontWeight, family: getComputedStyle(preview).fontFamily, lineHeight: getComputedStyle(preview).lineHeight, clamp: getComputedStyle(preview).webkitLineClamp, ellipsis: getComputedStyle(preview).textOverflow, whiteSpace: getComputedStyle(preview).whiteSpace },
      meta: box(meta), check: box(check), glyph: check.querySelector('svg') ? box(check.querySelector('svg')!) : null, target: box(target),
      heading: heading && box(heading), supporting: Boolean(heading), depth: Number(element.getAttribute('data-depth')) }
  })
}

function assertContentStack(measured: Awaited<ReturnType<typeof measurePreviewRow>>, scale: number, described: boolean, expectedType: string) {
  const stack = [measured.title, ...(measured.preview ? [measured.preview] : []), ...(!measured.supporting ? [measured.meta] : [])]
  for (const [index, node] of stack.entries()) {
    expect(node.left - measured.title.left).toBeCloseTo(0, 1)
    if (index) expect(node.top - stack[index - 1]!.bottom).toBeCloseTo(4, 1)
  }
  expect(measured.typeCount).toBe(1)
  expect(measured.typeInHeading).toBe(false)
  expect(measured.type.left - measured.title.left).toBeCloseTo(0, 1)
  expect(measured.type.text).toBe(expectedType)
  expect(measured.type.overflow).not.toBe('ellipsis')
  expect(measured.type.whiteSpace).toBe('nowrap')
  expect(measured.type.clamp).toBe('none')
  expect(measured.type.scrollWidth).toBeLessThanOrEqual(measured.type.clientWidth)
  expect(measured.type.scrollHeight).toBeLessThanOrEqual(measured.type.clientHeight)
  expect(measured.type.ink.left).toBeGreaterThanOrEqual(measured.type.left - 0.05)
  expect(measured.type.ink.right).toBeLessThanOrEqual(measured.type.right + 0.05)
  expect(measured.type.ink.top).toBeGreaterThanOrEqual(measured.type.top - 0.05)
  expect(measured.type.ink.bottom).toBeLessThanOrEqual(measured.type.bottom + 0.05)
  assertTypePaintBounds(measured)
  expect(measured.content.top).toBeCloseTo(measured.title.top, 1)
  expect(measured.content.bottom).toBeCloseTo(stack.at(-1)!.bottom, 1)
  expect(measured.content.height).toBeCloseTo(stack.reduce((height, node) => height + node.height, 0) + (stack.length - 1) * 4, 1)
  assertRowContentHeight(measured, scale, described)
}

function assertTypePaintBounds(measured: Awaited<ReturnType<typeof measurePreviewRow>>) {
  expect(measured.wordLineCounts.every((count) => count === 1), 'type words stay intact').toBe(true)
  for (const line of measured.typeLines) {
    for (const clip of [measured.row, measured.body]) {
      expect(line.left - clip.left, 'type leading breathing room').toBeGreaterThanOrEqual(4)
      expect(clip.right - line.right, 'type trailing breathing room').toBeGreaterThanOrEqual(4)
      expect(line.top - clip.top, 'type top breathing room').toBeGreaterThanOrEqual(4)
      expect(clip.bottom - line.bottom, 'type bottom breathing room').toBeGreaterThanOrEqual(4)
    }
    for (const paint of measured.paintedControls) expect(Math.max(paint.left - line.right, line.left - paint.right,
      paint.top - line.bottom, line.top - paint.bottom), 'type clears visible control paint').toBeGreaterThanOrEqual(4)
  }
}

function assertRowContentHeight(measured: Awaited<ReturnType<typeof measurePreviewRow>>, scale: number, described: boolean) {
  if (measured.heading) {
    assertSupportingRowHeight(measured, described)
  } else {
    const top = measured.depth ? 4 : 8
    const bottom = scale === 1 ? top : described ? 4 : 0
    expect(measured.row.height).toBeCloseTo(Math.max(measured.depth ? 52 : 68, measured.content.height + top + bottom, measured.target.height), 1)
  }
}

function assertSupportingRowHeight(measured: Awaited<ReturnType<typeof measurePreviewRow>>, described: boolean) {
  const heading = measured.heading!
  const footer = measured.footerContent!
  const top = measured.depth ? 4 : 8
  const bottom = described ? 4 : 0
  expect(measured.content.top - heading.top).toBeCloseTo(top, 1)
  expect(heading.height).toBeCloseTo(Math.max(measured.depth ? 52 : 68, measured.content.height + top + bottom), 1)
  expect(measured.type.top - heading.bottom).toBeCloseTo(described ? 0 : 4, 1)
  expect(measured.type.top - measured.content.bottom).toBeGreaterThanOrEqual(4)
  expect(measured.type.top).toBeCloseTo(measured.meta.top, 1)
  expect(footer.top).toBeCloseTo(measured.type.top, 1)
  expect(footer.bottom).toBeCloseTo(measured.meta.bottom, 1)
  expect(footer.height).toBeCloseTo(measured.meta.height, 1)
  expect(measured.row.bottom - measured.meta.bottom).toBeCloseTo(8, 1)
  expect(measured.row.height).toBeCloseTo(heading.height + (described ? 0 : 4) + footer.height + 8, 1)
}

async function assertPreviewRow(row: Locator, page: Page, scale: number, described: boolean, expectedType: string) {
  const measured = await measurePreviewRow(row)
  if (described) expect(measured.descriptionColour).toBe(measured.descriptionRest)
  assertContentStack(measured, scale, described, expectedType)
  expect(measured.titleSize).toBe(`${(measured.depth ? 14 : 17) * scale}px`)
  expect(measured.title.width).toBeGreaterThanOrEqual(Number.parseFloat(measured.titleSize))
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
    if (!measured.supporting) expect(Math.abs(measured.target.y - measured.row.y)).toBeLessThanOrEqual(1)
    else expect(measured.target.top - measured.row.top).toBe(measured.depth ? 4 : 8)
    expect(measured.meta.left - measured.title.left).toBeCloseTo(0, 1)
    expect(measured.supporting).toBe(scale === 2 || measured.depth === 2 && page.viewportSize()!.width === 320)
    if (measured.supporting) expect(measured.target.top).toBeCloseTo(measured.title.top, 1)
    if (measured.glyph) {
      expect(Math.abs(measured.glyph.x - measured.check.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(measured.glyph.y - measured.check.y)).toBeLessThanOrEqual(1)
    }
    expect(measured.target.width).toBe(48)
    expect(measured.target.height).toBeGreaterThanOrEqual(48)
  }
  await hoverStaticTarget(row.locator('[data-habit-row-body]'), { x: 12, y: 12 })
  const feedback = await measurePreviewRow(row)
  if (described) expect(feedback.descriptionColour).toBe(feedback.descriptionHover)
  expect(feedback.radius).toBe('20px')
  expect(feedback.bodyFill).toBe('rgba(0, 0, 0, 0)')
  const expectedFill = feedback.expectedFill
  expect(feedback.rowFill).toBe(expectedFill)
  await page.mouse.down()
  expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(expectedFill)
  await page.mouse.up()
  for (const [index, control] of (await row.locator('[data-habit-row-control]').all()).entries()) {
    await hoverStaticTarget(control)
    const hovered = await measurePreviewRow(row)
    assertTypePaintBounds(hovered)
    expect(hovered.rowFill).not.toBe(expectedFill)
    expect(hovered.controlFills[index]).toBe(expectedFill)
    await page.mouse.down()
    const pressed = await measurePreviewRow(row)
    assertTypePaintBounds(pressed)
    expect(pressed.rowFill).not.toBe(expectedFill)
    await page.mouse.up()
  }
  await page.mouse.move(0, 0)
  const resting = await measurePreviewRow(row)
  if (described) expect(resting.descriptionColour).toBe(resting.descriptionRest)
  expect(resting.rowFill).not.toBe(expectedFill)
  await assertPrimaryFocus(row, scale)
}

async function assertPrimaryFocus(row: Locator, scale: number) {
  const body = row.locator('[data-habit-row-body]')
  await row.page().keyboard.press('Tab')
  await body.focus()
  const focus = await body.evaluate((element) => {
    const style = getComputedStyle(element)
    return { active: element === document.activeElement, visible: element.matches(':focus-visible'), outline: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, radius: style.borderRadius, overflow: style.overflow }
  })
  expect(focus.active).toBe(true)
  expect(focus.visible).toBe(true)
  expect(focus).toMatchObject({ outline: 'solid', width: '2px', offset: '-4px', radius: '20px', overflow: 'hidden' })
  const measured = await measurePreviewRow(row)
  assertTypePaintBounds(measured)
  if (measured.supporting) expect(measured.body).toEqual(measured.row)
  await body.evaluate((element) => (element as HTMLElement).blur())
}

export async function completionPaint(control: Locator) {
  return control.evaluate((element) => {
    const fill = element.querySelector('[data-habit-row-check-fill]') ?? element.querySelector('[data-habit-check-feedback]') ?? element.querySelector('[data-habit-check]') ?? element
    return getComputedStyle(fill).backgroundColor
  })
}

export async function assertCompletionFill(control: Locator, scale: number, pressScale = 1, testExpect = expect) {
  const measured = await control.evaluate((element) => {
    const glyph = element.querySelector('[data-habit-check]')!
    const fill = element.querySelector('[data-habit-row-check-fill]') ?? element.querySelector('[data-habit-check-feedback]') ?? glyph
    const row = element.closest('[data-testid="habit-row"]')!
    const box = (part: Element) => {
      const bounds = part.getBoundingClientRect()
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height,
        x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    }
    const neighbor = row.querySelector('[data-habit-row-control="menu"]')!
    const title = row.querySelector('[data-personal-text]')!
    return { fill: box(fill), glyph: box(glyph), target: box(element), row: box(row), neighbor: box(neighbor), title: box(title),
      radius: getComputedStyle(fill).borderTopLeftRadius, paint: getComputedStyle(fill).backgroundColor,
      targetPaint: getComputedStyle(element).backgroundColor,
      painted: [element, ...element.querySelectorAll('*')].filter((part) => getComputedStyle(part).backgroundColor !== 'rgba(0, 0, 0, 0)').map(box) }
  })
  testExpect(measured.fill.width).toBeCloseTo(28 * pressScale, 1)
  testExpect(measured.fill.height).toBeCloseTo(28 * pressScale, 1)
  testExpect(measured.radius).toBe('12px')
  testExpect(measured.glyph.width).toBeCloseTo(28 * pressScale, 1)
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    testExpect(Math.abs(measured.fill[edge] - measured.glyph[edge])).toBeLessThanOrEqual(1)
  }
  testExpect(measured.target.width).toBeCloseTo(48 * pressScale, 1)
  testExpect(measured.target.height).toBeGreaterThanOrEqual(48 * pressScale - 0.1)
  const expected = await control.evaluate((element) => {
    const reference = document.createElement('span')
    reference.style.background = element.querySelector('[data-habit-check-feedback]') ? 'var(--bg-hover-opaque)' : 'var(--bg-hover)'
    element.append(reference)
    const paint = getComputedStyle(reference).backgroundColor
    reference.remove()
    return paint
  })
  await testExpect.poll(() => completionPaint(control)).toBe(expected)
  testExpect(measured.targetPaint).toBe('rgba(0, 0, 0, 0)')
  for (const painted of measured.painted) {
    testExpect(painted.left).toBeGreaterThanOrEqual(measured.glyph.left - 1)
    testExpect(painted.top).toBeGreaterThanOrEqual(measured.glyph.top - 1)
    testExpect(painted.right).toBeLessThanOrEqual(measured.glyph.right + 1)
    testExpect(painted.bottom).toBeLessThanOrEqual(measured.glyph.bottom + 1)
  }
  for (const axis of ['x', 'y'] as const) {
    testExpect(Math.abs(measured.fill[axis] - measured.glyph[axis])).toBeLessThanOrEqual(1)
    testExpect(Math.abs(measured.fill[axis] - measured.target[axis])).toBeLessThanOrEqual(1)
  }
  if (scale === 1) testExpect(Math.abs(measured.fill.y - measured.row.y)).toBeLessThanOrEqual(1)
  testExpect(measured.fill.left - measured.title.right).toBeGreaterThanOrEqual(4)
  testExpect(measured.neighbor.left - measured.fill.right).toBeGreaterThanOrEqual(4)
  testExpect(measured.row.right - measured.fill.right).toBeGreaterThanOrEqual(4)
  testExpect(measured.fill.top - measured.row.top).toBeGreaterThanOrEqual(4)
  testExpect(measured.row.bottom - measured.fill.bottom).toBeGreaterThanOrEqual(4)
}

// WHY: These fixtures disable transitions and animations; repeated locator stability waits add two frames per target. https://github.com/thomasluizon/orbit-tickets/issues/1693
async function hoverStaticTarget(target: Locator, offset?: { x: number; y: number }) {
  const point = await target.evaluate((element, offset) => {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const bounds = element.getBoundingClientRect()
    const x = bounds.left + (offset.x ?? bounds.width / 2)
    const y = bounds.top + (offset.y ?? bounds.height / 2)
    return { x, y, hitsTarget: element.contains(document.elementFromPoint(x, y)) }
  }, offset ?? { x: null, y: null })
  expect(point.hitsTarget).toBe(true)
  await target.page().mouse.move(point.x, point.y)
  expect(await target.evaluate(element => element.matches(':hover'))).toBe(true)
}
