import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const day = '2026-09-04'
const longTitle = 'Ler um capítulo inteiro do livro de história antes de dormir e anotar ideias para conversar com meus amigos amanhã cedo.'
const shortTitle = 'Ler'
const habits = createPaginatedSchema(habitScheduleItemSchema).parse({
  items: [longTitle, shortTitle].map((title, index) => makeHabitScheduleItem({
    id: `sheet-title-${index}`, title, dueDate: day, scheduledDates: [day], children: [], hasSubHabits: false,
  })),
  page: 1, pageSize: 200, totalCount: 2, totalPages: 1,
})

async function measureTitle(sheet: Locator) {
  await sheet.evaluate(() => document.fonts.ready)
  return sheet.locator('header').evaluate((header) => {
    const heading = header.querySelector<HTMLElement>('.orbit-sheet-title')!
    const typedTitle = heading.querySelector<HTMLElement>('.orbit-sheet-typed-title')
    const text = typedTitle ?? heading
    const close = header.querySelector<HTMLElement>('.orbit-sheet-close')!
    const titleBounds = heading.getBoundingClientRect()
    const closeBounds = close.getBoundingClientRect()
    const style = getComputedStyle(text)
    const probe = text.cloneNode(true) as HTMLElement
    probe.style.webkitLineClamp = 'unset'
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.width = `${text.getBoundingClientRect().width}px`
    text.parentElement!.append(probe)
    const fullHeight = probe.getBoundingClientRect().height
    probe.remove()
    const range = document.createRange()
    range.selectNodeContents(heading)
    return {
      lines: typedTitle
        ? text.getBoundingClientRect().height / Number.parseFloat(style.lineHeight)
        : new Set(Array.from(range.getClientRects(), (rectangle) => rectangle.top)).size,
      clamp: style.webkitLineClamp,
      truncated: fullHeight > text.getBoundingClientRect().height + 1,
      closeWidth: closeBounds.width, closeHeight: closeBounds.height,
      targetGap: closeBounds.left - titleBounds.right,
      availableWidth: closeBounds.left - Number.parseFloat(getComputedStyle(header).gap) - titleBounds.left,
      titleWidth: titleBounds.width,
    }
  })
}

for (const width of [320, 360, 384, 412, 600]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} sheet titles at ${width}px`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, hasProAccess: true })
      test.use({ appLocale: locale, layoutProfile: profile, viewport: { width, height: 915 } })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route(new RegExp(`${API.habits.list}[?]`), (route) => route.fulfill({ json: habits }))
      })

      for (const textScale of [1, 2]) {
        test(`personal names wrap and disclose at text scale ${textScale}`, async ({ page }) => {
          expect(longTitle).toHaveLength(120)
          await page.goto(`/?date=${day}`)
          await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px` }, textScale)
          const row = page.locator('[data-habit-title]').filter({ has: page.getByText(longTitle, { exact: true }) })
          await row.getByRole('button', { name: words.habits.actions.more, exact: true }).click()
          const sheet = page.getByRole('dialog', { name: longTitle, exact: true })
          await expect(sheet).toBeVisible()
          const measured = await measureTitle(sheet)
          expect(measured.lines).toBeCloseTo(2, 1)
          expect(measured.clamp).toBe('2')
          expect(measured.truncated).toBe(true)
          expect(measured.closeWidth).toBeGreaterThanOrEqual(48)
          expect(measured.closeHeight).toBeGreaterThanOrEqual(48)
          expect(measured.targetGap).toBeGreaterThanOrEqual(16)
          expect(measured.titleWidth).toBeCloseTo(measured.availableWidth, 0)
          if (textScale === 1) {
            await markUserText(page, [longTitle, shortTitle])
            await markRequiredLabels(sheet.getByRole('menuitem', { name: words.common.edit, exact: true }))
            await expectLabelsFit(page, sheet, [longTitle])
          }
          const trigger = sheet.getByRole('button', { name: longTitle, exact: true })
          await trigger.click()
          const fullText = sheet.locator('.orbit-sheet-full-title')
          await expect(fullText).toBeVisible()
          await expect(fullText).toHaveText(longTitle)
          expect(await fullText.evaluate((element) => getComputedStyle(element).webkitLineClamp)).toBe('none')
          await expect(sheet.getByRole('menu', { name: longTitle })).toBeVisible()
          await sheet.getByRole('button', { name: words.common.close, exact: true }).click()
          await expect(sheet).toHaveCount(0)
          const shortRow = page.locator('[data-habit-title]').filter({ has: page.getByText(shortTitle, { exact: true }) })
          await shortRow.getByRole('button', { name: words.habits.actions.more, exact: true }).click()
          const shortSheet = page.getByRole('dialog', { name: shortTitle, exact: true })
          expect((await measureTitle(shortSheet)).lines).toBeCloseTo(1, 1)
          await expectInteractionFill(shortSheet.getByRole('button', { name: shortTitle, exact: true }))
        })
      }

      test('product sheet titles retain one line', async ({ page }) => {
        await page.goto(`/?date=${day}`)
        await page.getByRole('button', { name: words.habits.listOptions, exact: true }).click()
        const sheet = page.getByRole('dialog', { name: words.habits.listOptions, exact: true })
        const heading = sheet.getByRole('heading')
        await markRequiredLabels(heading)
        await expectLabelsFit(page, sheet)
        expect((await measureTitle(sheet)).lines).toBeCloseTo(1, 1)
      })
    })
  }
}
