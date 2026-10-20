import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { prepareAgendaCalendar } from './calendar-agenda-fixtures'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { test } from './upgrade-fixtures'

for (const width of [320, 1280]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`${locale} Agenda headings at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 } })
      test('builds the today heading in one localized sentence and keeps long dates whole', async ({ page, context }) => {
        await prepareAgendaCalendar(context, locale)
        await page.goto('/calendar')
        await page.getByRole('radio', { name: words.calendar.view.agenda, exact: true }).click()
        const agenda = page.getByTestId('calendar-agenda-view')
        const headings = agenda.getByRole('heading')
        await expect(headings.nth(0)).toHaveText(locale === 'pt-BR' ? 'Hoje, sexta-feira, 4 de setembro' : 'Today, Friday, September 4')
        await expect(headings.nth(1)).toHaveText(locale === 'pt-BR' ? 'Sábado, 5 de setembro' : 'Saturday, September 5')
        await markRequiredLabels(headings)
        await expectLabelsFit(page, agenda)
      })
    })
  }
}
