import { expect } from '@playwright/test'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'

const replyEmail = `${'W'.repeat(48)}@example.com`

for (const width of [320, 360, 384, 412]) {
  for (const locale of ['en', 'pt-BR'] as const) {
    test.describe(`support labels at ${width}px in ${locale}`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 900 }, layoutProfile: { email: replyEmail } })

      test('keeps subjects whole and discloses the full reply email', async ({ page }) => {
        const words = (locale === 'pt-BR' ? ptBR : en).profile.support
        await page.goto(`${LAYOUT_ORIGIN}/support`)
        const form = page.locator('form')
        const subjects = form.getByRole('radiogroup', { name: words.subject })
        await expect(subjects.getByRole('radio')).toHaveCount(4)
        for (const option of Object.values(words.subjects)) {
          await markRequiredLabels(subjects.getByRole('radio', { name: option.label, exact: true }))
        }
        await markRequiredLabels(form.getByText(words.subject, { exact: true }))
        const reply = form.getByRole('button', { name: words.email, exact: true })
        const emailText = reply.getByText(replyEmail, { exact: true })
        await expect(emailText).toBeVisible()
        await expect(reply).toHaveAttribute('aria-expanded', 'false')
        await markUserText(page, [replyEmail])
        await expectLabelsFit(page, form, [replyEmail])
        const geometry = await emailText.evaluate((element) => {
          const control = element.closest('button')!
          const style = getComputedStyle(control)
          return {
            width: element.getBoundingClientRect().width,
            availableWidth: control.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
          }
        })
        expect(geometry.width).toBeCloseTo(geometry.availableWidth, 0)

        await subjects.getByRole('radio').first().click()
        const message = form.getByRole('textbox', { name: words.message })
        await message.fill('Saved support message')
        await reply.click()
        await expect(reply).toHaveAttribute('aria-expanded', 'true')
        expect(await emailText.evaluate((element) => {
          const style = getComputedStyle(element)
          return style.webkitLineClamp === 'none' && element.scrollHeight <= element.clientHeight + 1
            && element.scrollWidth <= element.clientWidth + 1
        })).toBe(true)
        await expectInteractionFill(reply)
        await reply.click()
        await expect(reply).toHaveAttribute('aria-expanded', 'false')
        await expect(message).toHaveValue('Saved support message')
        await expect(subjects.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true')
        await markUserText(page, [replyEmail])
        await expectLabelsFit(page, form, [replyEmail])
      })
    })
  }
}
