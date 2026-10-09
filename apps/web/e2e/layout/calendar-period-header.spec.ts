import { expect, type Locator } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { prepareAgendaCalendar } from './calendar-agenda-fixtures'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { restPointerOutside } from './pointer-rest'
import { test } from './upgrade-fixtures'


async function verifyPeriodActions(view: 'month' | 'week' | 'range' | 'agenda', locale: 'pt-BR' | 'en', words: typeof en | typeof ptBR, controls: Locator) {
  if (view === 'month') return
  const spans = locale === 'pt-BR' ? { range: '22 ago a 4 set', week: '31 ago a 6 set', agenda: '4 set a 10 set' } : { range: 'Aug 22 to Sep 4', week: 'Aug 31 to Sep 6', agenda: 'Sep 4 to Sep 10' }
  const label = spans[view]
  const title = controls.nth(1)
  await expect(title).toHaveText(label)
  await expect(title).toHaveAccessibleName(words.calendar.period.goToCurrent.replace('{period}', label))
  await controls.nth(0).click(); await expect(title).not.toHaveText(label)
  await title.click(); await expect(title).toHaveText(label)
  if (view === 'range') await expect(controls.nth(2)).toBeDisabled()
}

for (const width of [320, 412, 1100, 1352]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} shared calendar period header at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('centres the same chevrons around a borderless title in every view', async ({ page, context }) => {
        await prepareAgendaCalendar(context, locale)
        await page.goto('/calendar')
        let ring: string | undefined
        for (const view of ['month', 'week', 'range', 'agenda'] as const) {
          await page.getByRole('radio', { name: words.calendar.view[view], exact: true }).click()
          const header = page.getByTestId('calendar-header-group')
          const navigation = header.locator('[data-testid$="-navigation"]')
          const controls = navigation.getByRole('button')
          await expect(controls).toHaveCount(3)
          await restPointerOutside(header)
          await controls.nth(1).evaluate(async (title) => {
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            await Promise.all(title.getAnimations().filter((animation) => animation instanceof CSSTransition).map((animation) => animation.finished))
          })
          await expect(controls.nth(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
          const geometry = await controls.evaluateAll((buttons) => buttons.map((button) => {
            const bounds = button.getBoundingClientRect(); const style = getComputedStyle(button)
            const row = button.parentElement!.getBoundingClientRect()
            return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height,
              rowLeft: row.left, rowRight: row.right, shadow: style.boxShadow, radius: style.borderRadius }
          }))
          expect(Math.abs((geometry[0]!.left - geometry[0]!.rowLeft) - (geometry[2]!.rowRight - geometry[2]!.right))).toBeLessThanOrEqual(1)
          for (const index of [0, 2]) {
            expect(geometry[index]!.width).toBe(48); expect(geometry[index]!.height).toBe(48)
            ring ??= geometry[index]!.shadow
            expect(geometry[index]!.shadow).toBe(ring); expect(ring).toContain('1.5px')
          }
          expect(geometry[1]).toMatchObject({ shadow: 'none', radius: '12px' })
          const title = controls.nth(1)
          await expectInteractionFill(title)
          await markRequiredLabels(title)
          await expectLabelsFit(page, navigation)
          await verifyPeriodActions(view, locale, words, controls)
        }
      })
    })
  }
}
