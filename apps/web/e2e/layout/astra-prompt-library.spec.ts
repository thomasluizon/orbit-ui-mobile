import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '@orbit/shared/chat/prompt-library'
import { expectLabelsFit, markRequiredLabels } from './label-fit-contract'
import { test } from './upgrade-fixtures'

for (const width of [320, 412, 1352]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    const words = locale === 'en' ? en : ptBR
    test.describe(`Astra ideas in ${locale} at ${width}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { hasProAccess: true, hasGoogleConnection: true, aiMessagesUsed: 0 } })
      test('fits every label and retains the draft on return', async ({ page }) => {
        await page.goto('/?astra=open')
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        const input = conversation.locator('[data-composer-input]')
        await input.fill('Meu rascunho')
        await conversation.getByRole('button', { name: words.chat.templates.browse, exact: true }).first().click()
        const library = conversation.locator('[data-prompt-library]')
        await expect(library.getByRole('heading', { name: words.chat.templates.title, exact: true })).toBeFocused()
        for (const category of PROMPT_CATEGORIES) {
          await library.getByRole('button', { name: words.chat.templates.categories[category], exact: true }).click()
          const titles = library.locator('[data-slot="list-row-title"]')
          const categoryRegion = library.getByRole('region', { name: words.chat.templates.categories[category], exact: true })
          await expect(categoryRegion.locator('[data-slot="list-row-title"]')).toHaveCount(PROMPT_TEMPLATES.filter(template => template.category === category).length)
          await markRequiredLabels(titles)
          await expectLabelsFit(page, library)
          const filter = library.locator('[data-prompt-categories]')
          expect(await filter.evaluate(element => getComputedStyle(element).flexWrap)).toBe('nowrap')
        }
        await library.getByRole('button', { name: words.chat.templates.back, exact: true }).click()
        await expect(input).toHaveValue('Meu rascunho')
        await expect(conversation.getByRole('button', { name: words.chat.templates.browse, exact: true }).first()).toBeFocused()
      })
    })
  }
}
