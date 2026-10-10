import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { agendaRowTitles, prepareAgendaCalendar } from './calendar-agenda-fixtures'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

for (const width of [412, 1100, 1352]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} Agenda rows at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('orders touching two-line rows with values, status rings and padded fills', async ({ page, context }) => {
        await prepareAgendaCalendar(context, locale)
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.agenda, exact: true }).click()
        const day = page.getByTestId('calendar-agenda-day').first()
        const rows = day.locator('.orbit-list-row-body')
        await expect(rows).toHaveCount(4)
        await expect(rows.locator('[data-slot="list-row-title"]')).toHaveText(agendaRowTitles)
        await expect(rows.locator('[data-slot="list-row-value"]')).toHaveText([words.calendar.timeGrid.noSetTime, words.calendar.timeGrid.noSetTime, '08:00', '21:00'])
        await page.mouse.move(0, 0)
        const geometry = await rows.evaluateAll((rows) => rows.map((row) => {
          const body = row.getBoundingClientRect()
          const title = row.querySelector('[data-slot="list-row-title"]')!.getBoundingClientRect()
          const value = row.querySelector<HTMLElement>('[data-slot="list-row-value"]')!
          const probe = document.createElement('span'); probe.style.color = 'var(--fg-3)'; row.append(probe)
          const expectedTone = getComputedStyle(probe).color; probe.remove()
          const style = getComputedStyle(row)
          return { height: body.height, paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom),
            inset: title.left - body.left, titleTop: title.top, valueBottom: value.getBoundingClientRect().bottom,
            tone: getComputedStyle(value).color, expectedTone, size: parseFloat(getComputedStyle(value).fontSize), radius: style.borderRadius }
        }))
        for (const [index, row] of geometry.entries()) {
          expect(row.height).toBeGreaterThanOrEqual(67)
          expect(row.paddingTop).toBe(12); expect(row.paddingBottom).toBe(12)
          expect(row.inset).toBeCloseTo(16, 0); expect(row.radius).toBe('12px')
          expect(row.tone).toBe(row.expectedTone); expect(row.size).toBe(12)
          if (index) expect(Math.abs(row.titleTop - geometry[index - 1]!.valueBottom - 24)).toBeLessThanOrEqual(1)
          const control = rows.nth(index)
          await expect(control.locator('[data-status]')).toHaveCount(1)
          await expect(control.locator('svg')).toHaveCount(index === 0 ? 1 : 0)
          await expectInteractionFill(control)
        }
      })
    })
  }
}
