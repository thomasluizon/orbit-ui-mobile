import { setLayoutFixtureSession } from './profile-session'
import { expect } from '@playwright/test'
import { test } from './layout-test'
import { API } from '@orbit/shared/api'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { makeHabitDetail, makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitDetailSchema, habitMetricsSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { measureScrollbarGutter } from './scrollbar-geometry'

const habitId = 'habit-1'
const metrics = habitMetricsSchema.parse({
  currentStreak: 1,
  longestStreak: 1,
  weeklyCompletionRate: 100,
  monthlyCompletionRate: 100,
  totalCompletions: 1,
  lastCompletedDate: null,
})

for (const width of [412, 1280]) {
  test.describe(`habit detail spacing at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const title of [
      'Beber água',
      'Ler um capítulo longo e conversar sobre todos os detalhes com o grupo de leitura antes de escrever as ideias para a próxima reunião',
    ]) {
      for (const { hasTags, hasDescription } of [
        { hasTags: false, hasDescription: false },
        { hasTags: true, hasDescription: false },
        { hasTags: false, hasDescription: true },
        { hasTags: true, hasDescription: true },
      ]) {
        test(`uses the drawn gaps with tags ${hasTags} and description ${hasDescription} and title ${title}`, async ({ page, context }) => {
          const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title, dueTime: '08:00:00', description: hasDescription ? 'Uma pausa para cuidar da rotina.' : null })
          const schedule = makeHabitScheduleItem({ id: habitId, title: habit.title, dueTime: habit.dueTime, description: habit.description, tags: hasTags ? makeHabitScheduleItem().tags : [] })
          const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [schedule], page: 1, pageSize: 200, totalCount: 1, totalPages: 1 })
          await context.addCookies([{ name: 'i18n_locale', value: 'pt-BR', url: LAYOUT_ORIGIN }])
          await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profileSchema.parse({ ...profileFixture, language: 'pt-BR' }) }])
          await setLayoutFixtureSession(context, [{ path: API.habits.list, body: habits }])
          await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habitId)}`, (route) => route.fulfill({ json: habit }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.logs(habitId)}`, (route) => route.fulfill({ json: [] }))
          await context.route(`${LAYOUT_ORIGIN}${API.habits.metrics(habitId)}`, (route) => route.fulfill({ json: metrics }))

          await page.goto(`/habits/${habitId}`)
          const column = page.locator('[data-habit-detail-content]')
          await expect(column.locator('h1 > button')).toHaveText(habit.title)
          await expect(column.locator('.habit-detail-strip > p').first()).toHaveText(ptBr.habits.detail.lastThirtyDays)
          await expect(column.locator('[data-habit-detail-tags]')).toHaveCount(hasTags ? 1 : 0)
          await expect(column.locator('[data-habit-detail-description]')).toHaveCount(hasDescription ? 1 : 0)
          await page.evaluate(() => document.fonts.ready)
          const geometry = await column.evaluate((element) => {
            const header = element.querySelector('header')!
            const well = header.querySelector('button[aria-haspopup="dialog"]')!
            const row = header.querySelector<HTMLElement>('[data-habit-detail-header-row]')!
            const heading = header.querySelector('h1')!
            const copy = heading.parentElement!
            const controls = row.firstElementChild!
            const titleButton = heading.querySelector('button')!
            const summary = copy.querySelector('p')!
            const columnStyle = getComputedStyle(element)
            const headingStyle = getComputedStyle(heading)
            const summaryStyle = getComputedStyle(summary)
            const titleButtonStyle = getComputedStyle(titleButton)
            const strip = element.querySelector('.habit-detail-strip')!
            const label = strip.querySelector('p')!
            const headerSlot = Array.from(element.children).find((child) => child.contains(header))!
            const slots = Array.from(element.children)
            const between = slots.slice(slots.indexOf(headerSlot) + 1, slots.indexOf(strip))
            const metadata = Array.from(header.querySelectorAll('[data-habit-detail-tags], [data-habit-detail-description]'))
            let previousBottom = copy.getBoundingClientRect().bottom
            const metadataGaps = metadata.map((block) => {
              const content = block.firstElementChild!
              const gap = content.getBoundingClientRect().top - previousBottom
              previousBottom = content.getBoundingClientRect().bottom
              return gap
            })
            const fontProbe = document.createElement('span')
            element.append(fontProbe)
            fontProbe.style.fontFamily = 'var(--font-display)'
            const displayFont = getComputedStyle(fontProbe).fontFamily
            fontProbe.style.fontFamily = 'var(--font-mono)'
            const monoFont = getComputedStyle(fontProbe).fontFamily
            fontProbe.remove()
            return {
              displayFont,
              monoFont,
              contentWidth: element.getBoundingClientRect().width - Number.parseFloat(columnStyle.paddingLeft) - Number.parseFloat(columnStyle.paddingRight),
              headerInset: row.getBoundingClientRect().left - element.getBoundingClientRect().left,
              columnInset: Number.parseFloat(columnStyle.paddingLeft),
              wellWidth: well.getBoundingClientRect().width,
              wellHeight: well.getBoundingClientRect().height,
              wellRadius: getComputedStyle(well).borderRadius,
              copyWidth: copy.getBoundingClientRect().width,
              copyInset: copy.getBoundingClientRect().left - element.getBoundingClientRect().left,
              copyFollowsControls: controls.parentElement === row && controls.nextElementSibling === copy,
              controlsContainWell: controls.contains(well),
              controlsToCopy: copy.getBoundingClientRect().top - controls.getBoundingClientRect().bottom,
              wellAboveCopy: well.getBoundingClientRect().bottom <= copy.getBoundingClientRect().top,
              copyEndsHeader: copy.getBoundingClientRect().bottom === row.getBoundingClientRect().bottom,
              titleLines: (titleButton.getBoundingClientRect().height - Number.parseFloat(titleButtonStyle.paddingTop) - Number.parseFloat(titleButtonStyle.paddingBottom)) / Number.parseFloat(headingStyle.lineHeight),
              titleWhiteSpace: titleButtonStyle.whiteSpace,
              titleOverflow: titleButtonStyle.textOverflow,
              titleLineClamp: titleButtonStyle.webkitLineClamp,
              titleHorizontalOverflow: titleButton.scrollWidth > titleButton.clientWidth,
              titleVerticalOverflow: titleButton.scrollHeight > titleButton.clientHeight,
              contentHorizontalOverflow: element.scrollWidth > element.clientWidth,
              titleSize: headingStyle.fontSize,
              titleWeight: headingStyle.fontWeight,
              titleFont: headingStyle.fontFamily,
              summarySize: summaryStyle.fontSize,
              summaryFont: summaryStyle.fontFamily,
              headerToLabel: label.getBoundingClientRect().top - copy.getBoundingClientRect().bottom,
              contentToLabel: label.getBoundingClientRect().top - previousBottom,
              metadataGaps,
              zeroHeightSlots: between.filter((child) => child.getBoundingClientRect().height === 0).length,
              interveningSlots: between.length,
              emptyLiveRegion: headerSlot.querySelector('[role="status"][aria-live="polite"]')?.textContent === '',
            }
          })
          const gutter = await column.locator('xpath=ancestor::*[@data-shell-scroller]').evaluate(measureScrollbarGutter)
          expect(geometry.contentWidth).toBe(width === 412 ? width - 32 - gutter : 620)
          expect(geometry.headerInset).toBe(geometry.columnInset)
          expect(geometry.wellWidth).toBe(76)
          expect(geometry.wellHeight).toBe(76)
          expect(geometry.wellRadius).toBe('12px')
          expect(geometry.copyWidth).toBe(geometry.contentWidth)
          expect(geometry.copyInset).toBe(geometry.columnInset)
          expect(geometry.copyFollowsControls).toBe(true)
          expect(geometry.controlsContainWell).toBe(true)
          expect(geometry.controlsToCopy).toBe(12)
          expect(geometry.wellAboveCopy).toBe(true)
          expect(geometry.copyEndsHeader).toBe(true)
          expect(geometry.titleWhiteSpace).toBe('normal')
          expect(geometry.titleOverflow).not.toBe('ellipsis')
          expect(geometry.titleLineClamp).toBe('none')
          expect(geometry.titleHorizontalOverflow).toBe(false)
          expect(geometry.titleVerticalOverflow).toBe(false)
          expect(geometry.contentHorizontalOverflow).toBe(false)
          if (width === 412 && title !== 'Beber água') expect(geometry.titleLines).toBeGreaterThan(1)
          expect(geometry.titleSize).toBe(width === 412 ? '22px' : '28px')
          expect(geometry.titleWeight).toBe('500')
          expect(geometry.titleFont).toBe(geometry.displayFont)
          expect(geometry.summarySize).toBe('12px')
          expect(geometry.summaryFont).toBe(geometry.monoFont)
          if (!hasTags && !hasDescription) expect(geometry.headerToLabel).toBe(24)
          expect(geometry.contentToLabel).toBe(24)
          expect(geometry.metadataGaps).toEqual(Array(Number(hasTags) + Number(hasDescription)).fill(12))
          expect(geometry.zeroHeightSlots).toBe(0)
          expect(geometry.interveningSlots).toBe(0)
          expect(geometry.emptyLiveRegion).toBe(true)
        })
      }
    }
  })
}
