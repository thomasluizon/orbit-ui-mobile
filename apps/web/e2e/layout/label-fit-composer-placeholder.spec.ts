import { expect, type Locator } from '@playwright/test'
import { API } from '@orbit/shared/api'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import { habitDetailSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { setLayoutProfileSession } from './profile-session'
import { test } from './upgrade-fixtures'

const title = 'Caminhar pelo bairro e cuidar da rotina com todos os detalhes '.repeat(3)
const habit = habitDetailSchema.parse({ ...makeHabitDetail(), title, children: [], checklistItems: [] })

async function expectPlaceholderFit(field: Locator, placeholder: string, fontScale: number) {
  await expect(field).toHaveAttribute('placeholder', placeholder)
  await expect.poll(async () => field.evaluate((element, scale) => {
    const input = element as HTMLTextAreaElement
    const style = getComputedStyle(input)
    const singleLineHeight = parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    const canvas = document.createElement('canvas').getContext('2d')!
    canvas.font = style.font
    canvas.letterSpacing = style.letterSpacing
    const textWidth = canvas.measureText(input.placeholder).width
    const pill = input.parentElement!.getBoundingClientRect()
    const controls = [...input.parentElement!.querySelectorAll('button')].map(button => button.getBoundingClientRect())
    return input.scrollWidth <= input.clientWidth && input.scrollHeight <= input.clientHeight
      && (scale === 1 ? Math.abs(input.clientHeight - singleLineHeight) <= 1
        : textWidth <= input.clientWidth || input.clientHeight > singleLineHeight)
      && pill.height >= 56 && pill.height >= input.clientHeight + 8
      && controls.every((control, index) => control.width >= 48 && control.height >= 48
        && control.left >= pill.left && control.right <= pill.right
        && Math.abs(control.bottom - pill.bottom + 4) <= 1
        && (index === 0 || control.left >= controls[index - 1]!.right))
  }, fontScale)).toBe(true)
}

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['pt-BR', ptBR], ['en', en]] as const) {
    test.describe(`composer placeholder in ${locale} at ${width}px`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, aiMessagesUsed: 0 })
      test.use({ appLocale: locale, layoutProfile: profile, viewport: { width, height: 915 } })
      test.beforeEach(async ({ context }) => {
        await setLayoutProfileSession(context, profile)
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, route => route.fulfill({ json: profile }))
        await context.route(`${LAYOUT_ORIGIN}${API.habits.get(habit.id)}`, route => route.fulfill({ json: habit }))
      })

      test('grows on Hoje and in the conversation, then follows typed text', async ({ page }) => {
        await page.goto('/')
        const dock = page.locator('[data-shell-bottom] [data-composer-root]')
        await expect(dock).toHaveAttribute('data-state', 'idle')
        await page.evaluate(() => document.fonts.ready)
        for (const fontScale of [1, 1.5, 2, 1]) {
          await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
          await expectPlaceholderFit(dock.locator('[data-composer-input]'), words.shell.composer.placeholder, fontScale)
        }
        await expectLabelsFit(page, dock)
        const opener = dock.getByRole('button', { name: words.todayAstra.openConversation, exact: true })
        await expectInteractionFill(opener)
        await opener.click()
        const conversation = page.locator('[data-shell-conversation="overlay"]')
        const field = conversation.locator('[data-composer-input]')
        await markRequiredLabels(conversation.getByRole('log').getByText(words.chat.empty.title, { exact: true }))
        await expectLabelsFit(page, conversation)
        for (const fontScale of [1, 1.5, 2]) {
          await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
          await expectPlaceholderFit(field, words.shell.composer.placeholder, fontScale)
        }
        const placeholderHeight = await field.evaluate(element => element.clientHeight)
        await field.fill('Oi')
        await expect(field).toHaveValue('Oi')
        await expect.poll(async () => field.evaluate(element => element.clientHeight)).toBe(72)
        const draft = 'Mensagem com todos os detalhes da rotina\n'.repeat(12)
        await field.fill(draft)
        await expect(field).toHaveValue(draft)
        await expect.poll(async () => field.evaluate(element => element.clientHeight)).toBe(264)
        expect(await field.evaluate(element => element.scrollHeight)).toBeGreaterThan(264)
        await field.fill('')
        await expect.poll(async () => field.evaluate(element => element.clientHeight)).toBe(placeholderHeight)
      })

      test('grows with the habit detail placeholder', async ({ page }) => {
        await page.goto(`/habits/${habit.id}`)
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        await markUserText(page, [title])
        const composer = page.locator('[data-shell-bottom] [data-composer-root]')
        await expect(composer).toHaveAttribute('data-state', 'idle')
        await page.evaluate(() => document.fonts.ready)
        await expectLabelsFit(page, composer)
        for (const fontScale of [1, 1.5, 2, 1]) {
          await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px` }, fontScale)
          await expectPlaceholderFit(composer.locator('[data-composer-input]'), words.shell.composer.placeholder, fontScale)
        }
      })
    })
  }
}
