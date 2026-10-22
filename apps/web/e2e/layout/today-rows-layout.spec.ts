import { openTodayListOptions } from './hydration-guard'
import { setHabitTextScale, settleHabitRows } from './subhabit-indent-geometry'
import { writeFile } from 'node:fs/promises'
import { expect, type Page, type Locator } from '@playwright/test'
import { test } from './layout-test'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { createMockProactiveItem } from '@orbit/shared/__tests__/factories'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { profileSchema } from '@orbit/shared/types/profile'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { emptyHabitsPageFixture } from '../../test-support/hermetic/mock-api/fixtures/collections'
import { LAYOUT_ORIGIN } from '../support/env'
import { setLayoutProfileSession, setLayoutFixtureSession } from './profile-session'

const selectedDate = '2026-09-04'
const children = [0, 1].map((position) => makeHabitScheduleItem({
  id: `child-${position}`, title: `Child ${position}`, position,
  children: [], hasSubHabits: false, scheduledDates: [selectedDate],
}))
const items = [
  makeHabitScheduleItem({ id: 'parent', title: 'Parent', children, scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'timed', title: 'Timed', children: [], hasSubHabits: false,
    position: 1, dueTime: '21:00', scheduledDates: [selectedDate] }),
  makeHabitScheduleItem({ id: 'untimed', title: 'Untimed', children: [], hasSubHabits: false,
    position: 2, scheduledDates: [selectedDate] }),
]

for (const mode of ['dark', 'light'] as const) {
  for (const width of [412, 1280]) {
    test(`Hoje rows keep drawn geometry and parent contrast at ${width}px in ${mode}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 915 })
      const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'pt-BR' })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
      await setLayoutFixtureSession(context, [{ path: API.habits.list, body: { ...emptyHabitsPageFixture, items, totalCount: items.length } }])
      await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: 5 } }))
      await page.goto('/')
      const parent = page.locator('[data-testid="habit-row"][data-habit-title="Parent"]')
      const disclosure = parent.locator('[data-habit-row-control="disclosure"]')
      await expect(disclosure).toBeVisible()
      if (await disclosure.getAttribute('aria-expanded') === 'true') await disclosure.click()
      await expect(parent).toContainText('0 de 2')
      const panels = page.locator('.habit-panel')
      await expect(panels).toHaveCount(3)
      await page.evaluate(() => document.fonts.ready)
      const geometry = await panels.evaluateAll((elements) => elements.map((panel) => {
        const row = panel.querySelector('[data-testid="habit-row"]')!
        const body = row.querySelector('[data-habit-row-body]')!
        const well = body.querySelector(':scope > span > span')!
        const title = body.querySelector('[data-personal-text]')!
        const type = body.querySelector('[data-habit-row-type]')!
        const content = title.closest('[data-habit-row-title-block]')!
        const text = [title, ...body.querySelectorAll('[data-habit-row-meta]')]
        const check = row.querySelector('[data-habit-check]')!
        const target = check.closest('[data-habit-row-control]')!
        const bounds = panel.getBoundingClientRect()
        const wellBounds = well.getBoundingClientRect()
        const rowBounds = row.getBoundingClientRect()
        const center = (element: Element) => {
          const box = element.getBoundingClientRect()
          return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, width: box.width, height: box.height }
        }
        const track = row.querySelector('[data-habit-row-control="check"][aria-label*="/"] [data-habit-check]')
        return {
          height: bounds.height, above: wellBounds.top - bounds.top, below: bounds.bottom - wellBounds.bottom,
          row: center(row), well: center(well), check: center(check), target: center(target),
          inset: wellBounds.left - rowBounds.left,
          paddingTop: Number.parseFloat(getComputedStyle(body).paddingTop),
          paddingBottom: Number.parseFloat(getComputedStyle(body).paddingBottom),
          contentHeight: content.getBoundingClientRect().height,
          gap: Number.parseFloat(getComputedStyle(content).rowGap),
          type: { label: type.textContent, height: type.getBoundingClientRect().height, lineHeight: Number.parseFloat(getComputedStyle(type).lineHeight) },
          text: text.map((element) => {
            const box = element.getBoundingClientRect()
            return { top: box.top, bottom: box.bottom, height: box.height }
          }),
          track: track ? getComputedStyle(track).boxShadow.match(/rgba?\([^)]+\)/)?.[0] ?? null : null,
          card: getComputedStyle(row).backgroundColor,
          canvas: getComputedStyle(document.body).backgroundColor,
        }
      }))
      for (const panel of geometry) {
        expect(panel.height).toBeGreaterThanOrEqual(68)
        expect(panel.row.height).toBeCloseTo(panel.height, 1)
        expect(panel.inset).toBe(8)
        expect(panel.paddingTop).toBe(8)
        expect(panel.paddingBottom).toBe(8)
        expect(panel.type.label).toBe(ptBr.habits.form.typeHabit)
        expect(panel.type.height).toBeCloseTo(panel.type.lineHeight, 1)
        expect(panel.gap).toBe(4)
        for (let index = 1; index < panel.text.length; index++) {
          expect(panel.text[index]!.top - panel.text[index - 1]!.bottom).toBeCloseTo(4, 1)
        }
        const textHeight = panel.text.reduce((height, text) => height + text.height, 0) + 4 * (panel.text.length - 1)
        expect(panel.contentHeight).toBeCloseTo(textHeight, 1)
        expect(panel.height).toBeCloseTo(Math.max(68, Math.max(panel.well.height, textHeight) + 16), 1)
        expect(panel.above).toBeCloseTo(panel.below, 1)
        expect(panel.target.width).toBe(48)
        expect(panel.target.height).toBeGreaterThanOrEqual(48)
        expect(panel.check.width).toBe(28)
        expect(panel.check.height).toBe(28)
        expect(Math.abs(panel.target.y - panel.row.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(panel.check.x - panel.target.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(panel.check.y - panel.target.y)).toBeLessThanOrEqual(1)
      }
      const parentTrack = geometry.find((panel) => panel.track !== null)!
      expect(parentTrack.track).toBe(mode === 'dark' ? 'rgb(139, 139, 142)' : 'rgb(126, 126, 130)')
      expect(contrastOnSurface(parentTrack.track!, [parentTrack.canvas, parentTrack.card])).toBeGreaterThanOrEqual(3)
    })
  }
}

async function assertTodayTextEdges(page: Page, sentenceVisible: boolean, width: number) {
  const geometry = await page.evaluate((includeSentence) => {
    const rows = Array.from(document.querySelectorAll('[data-testid="habit-row"]'))
    const dates = Array.from(document.querySelectorAll('[data-today-date-row] [title] p'))
    const dateRow = document.querySelector('[data-today-date-row]')!.getBoundingClientRect()
    const sentence = document.querySelector('.today-astra-sentence')
    const titles = rows.map((row) => ({ element: (row.querySelector('[data-habit-row-heading] > div') ?? row.querySelector('[data-habit-row-body] > div') ?? row.querySelector('[data-personal-text-content] > div'))!, depth: Number(row.getAttribute('data-depth')) }))
    return {
      dateCenters: dates.map((element) => {
        const bounds = element.getBoundingClientRect()
        return (bounds.left + bounds.right) / 2
      }),
      columnCenter: (dateRow.left + dateRow.right) / 2,
      edges: [...titles, ...(includeSentence && sentence ? [{ element: sentence, depth: 0 }] : [])].map(({ element, depth }) => ({ left: element.getBoundingClientRect().left, depth })),
      insets: rows.map((row) => {
        const body = row.querySelector('[data-habit-row-body]')!
        const content = body.children.length ? body : body.parentElement!.querySelector('[data-personal-text-content]')!
        const well = content.querySelector('[data-habit-row-heading] > span > span, :scope > span > span')!
        return { inset: well.getBoundingClientRect().left - body.getBoundingClientRect().left, depth: Number(row.getAttribute('data-depth')) }
      }),
      targets: rows.flatMap((row) => Array.from(row.querySelectorAll('button')).map((button) => {
        const bounds = button.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }
      })),
      overflow: document.documentElement.scrollWidth,
    }
  }, sentenceVisible)
  expect(geometry.dateCenters).toHaveLength(2)
  for (const center of geometry.dateCenters) expect(Math.abs(center - geometry.columnCenter)).toBeLessThanOrEqual(1)
  expect(geometry.edges).toHaveLength(sentenceVisible ? 4 : 3)
  for (const edge of geometry.edges) expect(Math.abs(edge.left - (edge.depth === 1 ? 100 : 84))).toBeLessThanOrEqual(1)
  expect(geometry.insets).toHaveLength(3)
  for (const { inset, depth } of geometry.insets) expect(inset).toBe(depth === 1 ? 24 : 8)
  expect(geometry.overflow).toBeLessThanOrEqual(width)
  for (const target of geometry.targets) {
    expect(target.left).toBeGreaterThanOrEqual(16)
    expect(target.right).toBeLessThanOrEqual(width - 16)
    expect(target.width).toBeGreaterThanOrEqual(48)
    expect(target.height).toBeGreaterThanOrEqual(48)
  }
}

for (const width of [320, 600]) {
  for (const textScale of [1, 2]) {
    for (const mode of ['dark', 'light'] as const) {
      test(`Hoje body fills keep a padded shared edge at ${width}px and ${textScale} text scale in ${mode}`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 915 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language: 'pt-BR' })
        await setLayoutProfileSession(context, profile)
        await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile }])
        const child = makeHabitScheduleItem({ id: 'padded-child', title: 'Caminhar pela praça depois do almoço', children: [], hasSubHabits: false, scheduledDates: [selectedDate] })
        const habits = [
          makeHabitScheduleItem({ id: 'padded-parent', title: 'Cuidar da rotina da casa todos os dias', children: [child], scheduledDates: [selectedDate] }),
          makeHabitScheduleItem({ id: 'padded-leaf', title: 'Ler um capítulo do livro antes de dormir', children: [], hasSubHabits: false, position: 1, scheduledDates: [selectedDate] }),
        ]
        await setLayoutFixtureSession(context, [{ path: API.habits.list, body: { ...emptyHabitsPageFixture, items: habits, totalCount: habits.length } }])
        await context.route(`${LAYOUT_ORIGIN}${API.habits.count}`, (route) => route.fulfill({ json: { count: 3 } }))
        const proactive = createMockProactiveItem({ text: 'Sua rotina mudou. Vamos conversar?', localDate: selectedDate })
        await setLayoutFixtureSession(context, [{ path: API.proactive.current, body: proactive }])
        await page.goto('/')
        const disclosure = page.locator('[data-habit-row-control="disclosure"]')
        await expect(disclosure).toBeVisible()
        if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
        await expect(page.getByTestId('habit-row')).toHaveCount(3)
        await expect(page.locator('.today-astra-sentence')).toHaveText(proactive.text)
        await setHabitTextScale(page, textScale, [habits[0]!.title])
        await page.evaluate(async (scale) => {
          for (const label of document.querySelectorAll<HTMLElement>('.today-astra-sentence')) {
            label.style.fontSize = `${Number.parseFloat(getComputedStyle(label).fontSize) * scale}px`
          }
          await document.fonts.ready
        }, textScale)
        for (const selecting of [false, true]) {
          if (selecting) {
            await openTodayListOptions(page, ptBr.habits.listOptions)
            await page.getByRole('menuitem', { name: ptBr.common.select, exact: true }).click()
            await expect(page.locator('[data-habit-row-control="selection"]')).toHaveCount(3)
            await expect(page.locator('.today-astra-sentence')).toHaveCount(0)
          }
          await assertTodayTextEdges(page, !selecting, width)
          for (const body of await page.locator('[data-habit-row-body]').all()) {
            await body.hover()
            await expect(body).toHaveCSS('border-radius', '20px')
            const depth = await body.evaluate((element) => element.closest('[data-depth]')!.getAttribute('data-depth'))
            const expectedInset = depth === '1' ? 24 : 8
            await expect(body).toHaveCSS('padding-inline-start', `${expectedInset}px`)
            await page.mouse.down()
            const pressedInset = await body.evaluate((element) => {
              const content = element.children.length ? element : element.parentElement!.querySelector('[data-personal-text-content]')!
              const well = content.querySelector('[data-habit-row-heading] > span > span, :scope > span > span')!
              const bounds = element.getBoundingClientRect()
              const scale = Number.parseFloat(getComputedStyle(element).scale) || 1
              return (well.getBoundingClientRect().left - bounds.left) / scale
            })
            expect(pressedInset).toBeCloseTo(expectedInset, 2)
            await page.mouse.move(width - 1, 914)
            await page.mouse.up()
            // Wait for dnd-kit's click capture cleanup: https://github.com/clauderic/dnd-kit/blob/@dnd-kit/core@6.3.1/packages/core/src/sensors/pointer/AbstractPointerSensor.ts#L159
            await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)))
            await body.evaluate((element) => { element.parentElement!.tabIndex = 0; (element.parentElement as HTMLElement).focus() })
            await page.keyboard.press('Tab')
            await expect(body).toBeFocused()
            expect(await body.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2)
            await assertTodayTextEdges(page, !selecting, width)
            await body.evaluate((element) => { element.parentElement!.tabIndex = -1; (element as HTMLElement).blur() })
          }
        }
      })
    }
  }
}

for (const language of ['en', 'pt-BR'] as const) for (const mode of ['dark', 'light'] as const) {
  for (const width of [320, 412, 1352]) {
    const normalSupportingTitles = width === 320 ? ['Grandchild', 'Child parent'] : []
    test(`Habit previews and full-row feedback at ${width}px in ${mode} ${language}`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 1200 })
      const description = language === 'en' ? 'Read two pages before breakfast.' : 'Leia duas páginas antes do café.'
      const preview = `**${description}** `.repeat(40)
      const nested = makeHabitScheduleItem({ id: 'preview-nested', title: 'Child parent', description: preview,
        children: [makeHabitScheduleItem({ id: 'preview-grandchild', title: 'Grandchild', children: [], hasSubHabits: false, scheduledDates: [selectedDate] })], scheduledDates: [selectedDate] })
      const describedItems = items.map((item, index) => ({ ...item, description: index === 2 ? null : preview,
        ...(index === 0 ? { children: [nested, { ...children[1]!, description: '   ' }] } : {}) }))
      const copy = language === 'en' ? en : ptBr
      const profile = profileSchema.parse({ ...profileFixture, themePreference: mode, language })
      await setLayoutProfileSession(context, profile)
      await setLayoutFixtureSession(context, [
        { path: API.profile.get, body: profile },
        { path: API.habits.list, body: { ...emptyHabitsPageFixture, items: describedItems, totalCount: describedItems.length } },
      ])
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready)
      const parent = page.locator('[data-testid="habit-row"][data-habit-title="Parent"]')
      const disclosure = parent.locator('[data-habit-row-control="disclosure"]')
      await expect(disclosure).toBeVisible()
      if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click()
      await expect(page.getByTestId('habit-row')).toHaveCount(6)
      await expect(page.locator('[data-habit-row-description]')).toHaveCount(3)
      for (const scale of [1, 2]) {
        const visibleTitles = width === 320 && scale === 2 ? ['Parent', 'Child parent'] : ['Parent', 'Child parent', 'Grandchild']
        await setHabitTextScale(page, scale, visibleTitles, normalSupportingTitles)
        await expect(parent.locator('[data-habit-row-description]')).toHaveCSS('font-size', `${14 * scale}px`)
        await expect(parent.locator('[data-habit-row-heading]')).toHaveCount(scale === 2 ? 1 : 0)
        await assertPreviewSelectionModes(page, parent, copy, scale, mode, width === 320 && scale === 2 ? 5 : 6, normalSupportingTitles)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      }
    })
  }
}

async function assertPreviewSelectionModes(page: Page, parent: Locator, copy: typeof en | typeof ptBr, scale: number, mode: 'light' | 'dark', rowCount: number, normalSupportingTitles: readonly string[]) {
  for (const selecting of [false, true]) {
    if (selecting) {
      await openTodayListOptions(page, copy.habits.listOptions)
      await page.getByRole('menuitem', { name: copy.common.select, exact: true }).click()
      await expect(page.locator('[data-habit-row-control="selection"]')).toHaveCount(rowCount)
      await parent.locator('[data-habit-row-body]').click()
      await expect(parent.locator('[data-habit-row-control="selection"]')).toHaveAttribute('aria-pressed', 'true')
      const leaf = page.locator('[data-testid="habit-row"][data-habit-title="Timed"]')
      await leaf.locator('[data-habit-row-body]').click()
      await expect(leaf.locator('[data-habit-row-control="selection"]')).toHaveAttribute('aria-pressed', 'true')
    }
    await settleHabitRows(page.getByTestId('habit-row'), scale, selecting, normalSupportingTitles)
    for (const row of await page.getByTestId('habit-row').all()) await assertHabitPreviewRow(row, scale, mode, page, scale > 1.3 || normalSupportingTitles.includes((await row.getAttribute('data-habit-title'))!))
  }
  await page.getByRole('button', { name: copy.common.cancel, exact: true }).click()
  await expect(page.locator('[data-habit-row-control="selection"]')).toHaveCount(0)
}

async function assertHabitPreviewRow(row: Locator, scale: number, mode: 'light' | 'dark', page: Page, supporting: boolean) {
  const geometry = await row.evaluate((element) => {
    const bounds = (node: Element) => { const box = node.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, width: box.width, height: box.height } }
    const title = element.querySelector('[data-personal-text]')!
    const preview = element.querySelector('[data-habit-row-description]')
    const meta = element.querySelector('[data-habit-row-meta]')
    const textEdge = title.closest('div')!.getBoundingClientRect().left
    const well = Array.from(element.querySelectorAll('span')).find((node) => ['32px', '46px'].includes(getComputedStyle(node).width) && getComputedStyle(node).borderRadius === '12px')!
    const check = element.querySelector('[data-habit-check]')!
    let target = check.parentElement!
    while (target !== element && target.getBoundingClientRect().width !== 48) target = target.parentElement!
    const geometry = { row: bounds(element), depth: Number(element.getAttribute('data-depth')), title: bounds(title), titleSize: getComputedStyle(title).fontSize,
      supporting: Boolean(element.querySelector('[data-habit-row-heading]')),
      parent: Boolean(element.querySelector('[data-habit-row-control="disclosure"]')),
      preview: preview && { ...bounds(preview), size: getComputedStyle(preview).fontSize, lineHeight: Number.parseFloat(getComputedStyle(preview).lineHeight) },
      textEdge, well: bounds(well), meta: meta && bounds(meta), check: bounds(check), target: bounds(target),
      glyph: check.querySelector('svg') ? bounds(check.querySelector('svg')!) : null,
      controls: Array.from(element.querySelectorAll('[data-habit-row-control]')).map(bounds) }
    const controlChains = Array.from(element.querySelectorAll('[data-habit-row-control]')).map((control) => {
      const chain = []
      for (let node: Element | null = control; node && node !== element; node = node.parentElement) {
        const style = getComputedStyle(node)
        chain.push({
          tag: node.tagName, className: node.className, inlineStyle: node.getAttribute('style'), rect: bounds(node),
          display: style.display, position: style.position, top: style.top, transform: style.transform,
          paddingBlockStart: style.paddingBlockStart, paddingTop: style.paddingTop, margin: style.margin,
          alignItems: style.alignItems, alignSelf: style.alignSelf, gridRow: style.gridRow, gridColumn: style.gridColumn,
          transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration,
          animations: node.getAnimations().map((animation) => ({
            property: animation instanceof CSSTransition ? animation.transitionProperty : null,
            playState: animation.playState, currentTime: String(animation.currentTime),
          })),
        })
      }
      return { control: control.getAttribute('data-habit-row-control'), chain }
    })
    return { ...geometry, controlChains }
  })
  try {
    assertPreviewText()
    assertPreviewControls()
  } catch (assertionError) {
    try {
      const observationAfterGeometry = await row.evaluate(observeHabitPreviewFailure)
      await writeFile(test.info().outputPath('habit-row-preview-failure.json'), JSON.stringify({
        scale, mode, geometry, observationAfterGeometry,
      }, null, 2))
    } finally {
      throw assertionError
    }
  }
  function assertPreviewText() {
    if (geometry.preview) {
      expect(geometry.preview.size).toBe(`${14 * scale}px`)
      expect(geometry.preview.top - geometry.title.bottom).toBeCloseTo(4, 1)
      expect(geometry.preview.height).toBeCloseTo(geometry.preview.lineHeight * (scale === 1 ? 1 : 2), 0)
      expect(geometry.preview.right).toBeLessThanOrEqual(geometry.row.right - 8)
      if (geometry.meta) expect(geometry.meta.top - geometry.preview.bottom).toBeGreaterThanOrEqual(3.9)
    } else if (geometry.meta && !geometry.supporting) {
      expect(geometry.meta.top - geometry.title.bottom).toBeCloseTo(4, 1)
    }
    if (geometry.meta) {
      expect(geometry.meta.left).toBeCloseTo(geometry.textEdge, 1)
      expect(geometry.row.bottom - geometry.meta.bottom).toBeGreaterThanOrEqual(3.9)
    }
  }
  function assertPreviewControls() {
    expect(geometry.titleSize).toBe(`${(geometry.depth ? 14 : 17) * scale}px`)
    expect(geometry.well.left - geometry.row.left).toBe(8 + 16 * geometry.depth)
    expect(geometry.supporting).toBe(supporting)
    expect(geometry.target.width).toBe(48)
    expect(geometry.target.height).toBeGreaterThanOrEqual(48)
    expect(geometry.check.width).toBe(28)
    expect(geometry.check.height).toBe(28)
    expect(Math.abs(geometry.check.x - geometry.target.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry.check.y - geometry.target.y)).toBeLessThanOrEqual(1)
    if (!supporting) expect(Math.abs(geometry.target.y - geometry.row.y)).toBeLessThanOrEqual(1)
    else {
      expect(geometry.target.top - geometry.row.top).toBe(geometry.depth ? 4 : 8)
      expect(geometry.target.top).toBeCloseTo(geometry.title.top, 1)
    }
    if (geometry.glyph) {
      expect(Math.abs(geometry.glyph.x - geometry.check.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.glyph.y - geometry.check.y)).toBeLessThanOrEqual(1)
    }
    for (const control of geometry.controls) {
      expect(control.width).toBeGreaterThanOrEqual(48)
      expect(control.height).toBeGreaterThanOrEqual(48)
      expect(control.left).toBeGreaterThanOrEqual(geometry.title.right - 1)
      expect(control.right).toBeLessThanOrEqual(geometry.row.right)
    }
  }
  const body = row.locator('[data-habit-row-body]')
  await body.hover({ position: { x: 12, y: 12 } })
  await expect(row).toHaveCSS('background-color', mode === 'dark' ? 'rgba(250, 250, 250, 0.13)' : 'rgba(9, 9, 11, 0.11)')
  await expect(row).toHaveCSS('border-radius', '20px')
  await expect(body).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  for (const control of await row.locator('[data-habit-row-control]').all()) {
    await control.hover()
    await expect(row).not.toHaveCSS('background-color', mode === 'dark' ? 'rgba(250, 250, 250, 0.13)' : 'rgba(9, 9, 11, 0.11)')
  }
  await page.mouse.move(0, 0)
}

function observeHabitPreviewFailure(element: Element) {
  const readStyle = (node: Element) => {
    const style = getComputedStyle(node)
    const box = node.getBoundingClientRect()
    const inline = (node as HTMLElement).style
    return {
      tag: node.tagName, className: node.className,
      inlinePadding: { block: inline.paddingBlock, start: inline.paddingBlockStart, end: inline.paddingBlockEnd },
      rect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, width: box.width, height: box.height },
      display: style.display, position: style.position, top: style.top, margin: style.margin,
      alignItems: style.alignItems, alignSelf: style.alignSelf, minHeight: style.minHeight,
      gridRow: style.gridRow, gridColumn: style.gridColumn,
      paddingBlockStart: style.paddingBlockStart, paddingBlockEnd: style.paddingBlockEnd,
      lineHeight: style.lineHeight, fontSize: style.fontSize,
      transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration, transform: style.transform,
      transitions: node.getAnimations()
        .filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
        .map((animation) => ({ property: animation.transitionProperty,
          playState: animation.playState, currentTime: String(animation.currentTime),
          duration: animation.effect!.getTiming().duration, easing: animation.effect!.getTiming().easing })),
    }
  }
  const titleChain = []
  for (let node = element.querySelector('[data-personal-text]'); node && node !== element; node = node.parentElement) {
    titleChain.push(readStyle(node))
  }
  const controlChains = Array.from(element.querySelectorAll('[data-habit-row-control]')).map((control) => {
    const chain = []
    for (let node: Element | null = control; node && node !== element; node = node.parentElement) chain.push(readStyle(node))
    return { control: control.getAttribute('data-habit-row-control'), chain }
  })
  const title = element.getAttribute('data-habit-title')
  return {
    habitTitle: ['Parent', 'Child parent', 'Grandchild', 'Child 1', 'Timed', 'Untimed'].includes(title ?? '') ? title : 'unexpected-fixture-row',
    connected: element.isConnected,
    rootInlineFont: document.documentElement.style.fontSize,
    rootComputedFont: getComputedStyle(document.documentElement).fontSize,
    rootClass: document.documentElement.className,
    supporting: Boolean(element.querySelector('[data-habit-row-heading]')),
    selectedMode: Boolean(element.querySelector('[data-habit-row-control="selection"]')),
    row: readStyle(element), body: readStyle(element.querySelector('[data-habit-row-body]')!), titleChain, controlChains,
  }
}

for (const width of [412, 1352]) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Habit row live feedback arrival and exit at ${width}px with ${reducedMotion}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 915 })
    await page.emulateMedia({ reducedMotion })
    await setLayoutFixtureSession(context, [{ path: API.habits.list, body: { ...emptyHabitsPageFixture, items, totalCount: items.length } }])
    await page.goto('/')
    const row = page.locator('[data-testid="habit-row"][data-habit-title="Timed"]')
    const body = row.locator('[data-habit-row-body]')
    await expect(row).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const paint = () => row.evaluate((element) => ({ fill: getComputedStyle(element).backgroundColor, outline: getComputedStyle(element).boxShadow }))
    const samples = () => row.evaluate(async (element) => {
      const result: { fill: string; outline: string }[] = []
      const start = performance.now()
      do {
        result.push({ fill: getComputedStyle(element).backgroundColor, outline: getComputedStyle(element).boxShadow })
        await new Promise(requestAnimationFrame)
      } while (performance.now() - start < 550)
      return result
    })
    const rest = await paint()
    const [arrival] = await Promise.all([samples(), body.hover({ position: { x: 12, y: 12 } })])
    const hover = await paint()
    expect(hover.fill).not.toBe(rest.fill)
    expect(hover.outline).not.toBe(rest.outline)
    const [exit] = await Promise.all([samples(), page.mouse.move(0, 0)])
    expect(await paint()).toEqual(rest)
    for (const property of ['fill', 'outline'] as const) for (const sequence of [arrival, exit]) {
      expect(sequence.some((frame) => frame[property] !== rest[property] && frame[property] !== hover[property])).toBe(reducedMotion === 'no-preference')
    }
    await body.hover({ position: { x: 12, y: 12 } })
    await page.mouse.down()
    expect(await paint()).toEqual(hover)
    await page.mouse.move(0, 0)
    await page.mouse.up()
    await expect.poll(paint).toEqual(rest)
  })
}
