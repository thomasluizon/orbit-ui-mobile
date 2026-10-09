import { completeInstallOnboarding } from './install-onboarding'
import { expect, test, type Page } from '@playwright/test'
import messages from '@orbit/shared/i18n/en.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutProfileSession } from './profile-session'
import { expectOneFieldIndicator, inspectFocusedRing } from './focus-indicators'

async function expectOneRing(page: Page, surface: string, stop: number) {
  const state = await inspectFocusedRing(page)
  expect(state, `${surface} Tab stop ${stop} has a focused control`).not.toBeNull()
  if (!state) return
  expect(state.focusVisible, `${surface} Tab stop ${stop}: ${state.focused} is keyboard-focused`).toBe(true)
  expect(state.indicators, `${surface} Tab stop ${stop}: ${state.focused} drew ${state.indicators.join(', ')}`).toHaveLength(1)
}

async function inspectTabStops(page: Page, surface: string) {
  const conversation = page.locator('[data-shell-conversation]')
  let focusedStops = 0
  for (let stop = 1; stop <= 45; stop += 1) {
    const conversationWasOpen = await conversation.isVisible()
    await page.keyboard.press('Tab')
    if (!conversationWasOpen && await conversation.isVisible()) {
      await expect(conversation.locator('[data-composer-input]')).toBeFocused()
      await expect(page.locator('[data-composer-input]:visible')).toHaveCount(1)
    }
    const state = await inspectFocusedRing(page)
    if (!state) continue
    focusedStops += 1
    expect(state.focusVisible, `${surface} Tab stop ${stop}: ${state.focused} is keyboard-focused`).toBe(true)
    expect(state.indicators, `${surface} Tab stop ${stop}: ${state.focused} drew ${state.indicators.join(', ')}`).toHaveLength(1)
  }
  expect(focusedStops, `${surface} must expose keyboard controls`).toBeGreaterThan(0)
}

async function focusConversationComposer(page: Page, width: number) {
  const conversation = page.locator('[data-shell-conversation="overlay"]')
  const conversationWasOpen = await conversation.isVisible()
  if (!conversationWasOpen) {
    if (width >= 1024) await page.locator('[data-shell-astra-row]').click()
    else await page.locator('[data-shell-pinned-slot] [data-composer-input]').focus()
  }
  await expect(conversation).toBeVisible()
  await expect(page.locator('[data-shell-pinned-slot]')).toBeHidden()
  await expect(page.locator('[data-composer-input]:visible')).toHaveCount(1)
  const field = conversation.locator('[data-composer-input]')
  if (conversationWasOpen) await field.focus()
  await expect(field).toBeFocused()
  return field
}

async function openCreateForm(page: Page) {
  await page.goto('/habits/new')
  await expect(page.locator('[data-habit-create-screen]')).toBeVisible()
}

for (const width of [412, 1280] as const) {
  test.describe(`focus rings at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const [surface, path, targetSelector] of [
      ['Hoje', '/', '[data-shell-conversation] [data-composer-input]'],
      ['Busca', '/search', '[cmdk-input]'],
      ['Suporte', '/support', 'form textarea'],
      ['Perfil', '/profile', null],
      ['Calendário', '/calendar', null],
      ['Progresso', '/progress', 'main [data-empty-state-action] button'],
    ] as const) {
      test(`${surface} has one ring at each Tab stop`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
        await inspectTabStops(page, `${surface} ${width}px`)
        if (targetSelector === null) return
        const conversation = page.locator('[data-shell-conversation]')
        if (surface !== 'Hoje' && await conversation.isVisible()) {
          await conversation.getByRole('button', { name: messages.common.closeConversation }).click()
          await expect(conversation).toBeHidden()
        }
        const target = surface === 'Hoje'
          ? await focusConversationComposer(page, width)
          : page.locator(targetSelector).first()
        await expect(target).toBeVisible()
        await target.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        await expect(target).toBeFocused()
        await expectOneRing(page, `${surface} route control ${width}px`, 0)
        if (surface === 'Hoje') await expectOneFieldIndicator(page, target, '[data-composer-input-row]', `composer ${width}px`)
        if (surface === 'Busca') await expectOneFieldIndicator(page, target, 'div.relative', `search ${width}px`, { includeDescendants: true })
        if (surface === 'Suporte') await expectOneFieldIndicator(page, target, '[data-input-root]', `support message ${width}px`)
      })
    }

    test('palette field and commands have one ring', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
      if (width === 1280) {
        await page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.nav.search }).click()
      } else {
        await page.keyboard.press('Control+k')
      }
      const field = page.locator('[cmdk-input]')
      await expect(page.getByRole('dialog', { name: messages.command.title })).toBeVisible()
      await expect(field).toBeVisible()
      await field.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(field).toBeFocused()
      await expectOneRing(page, `palette field ${width}px`, 0)
      await expectOneFieldIndicator(page, field, 'div.relative', `palette search ${width}px`, { includeDescendants: true })
      await inspectTabStops(page, `palette ${width}px`)
    })

    test('create habit form has one ring at each Tab stop', async ({ page }) => {
      await openCreateForm(page)
      const phrase = page.locator('#habit-phrase')
      await expect(phrase).toBeVisible()
      await phrase.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(phrase).toBeFocused()
      await expectOneRing(page, `create phrase ${width}px`, 0)
      await expectOneFieldIndicator(page, phrase, '[data-habit-phrase-field]', `create phrase ${width}px`, { includeDescendants: true })
      await inspectTabStops(page, `create form ${width}px`)
      await phrase.fill('Caminhar toda segunda')
      await inspectTabStops(page, `create form with phrase ${width}px`)
      await page.getByRole('button', { name: messages.habits.form.moreDetails }).click()
      const disclosure = page.locator('.habit-form-disclosure[data-open="true"]')
      await expect(disclosure).toBeVisible()
      const time = disclosure.getByRole('textbox', { name: messages.habits.form.exactTime })
      await expect(time).toBeVisible()
      await time.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(time).toBeFocused()
      await expectOneRing(page, `create exact time ${width}px`, 0)
      await expectOneFieldIndicator(page, time, 'input[data-hour-cycle]', `create time ${width}px`)
      await inspectTabStops(page, `create expanded form ${width}px`)
    })

    test('sub-habit input and remove action each have one ring', async ({ page, context }) => {
      const profile = profileSchema.parse({
        ...profileFixture,
        plan: 'pro',
        hasProAccess: true,
        aiMessagesLimit: 50,
      })
      await setLayoutProfileSession(context, profile)
      await openCreateForm(page)
      await expect(page.locator('#habit-phrase')).toBeVisible()
      await page.getByRole('button', { name: messages.habits.form.moreDetails }).click()
      const disclosure = page.locator('.habit-form-disclosure[data-open="true"]')
      await expect(disclosure).toBeVisible()
      await disclosure.getByRole('button', { name: messages.habits.form.addSubHabit }).click()
      const input = disclosure.getByRole('textbox', { name: messages.habits.form.subHabitInputLabel.replace('{index}', '1') })
      await expect(input).toBeVisible()
      await input.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(input).toBeFocused()
      await expectOneRing(page, `sub-habit input ${width}px`, 0)
      await page.keyboard.press('Tab')
      await expect(disclosure.getByRole('button', { name: messages.habits.form.removeSubHabit })).toBeFocused()
      await expectOneRing(page, `sub-habit remove ${width}px`, 1)
      await expectOneFieldIndicator(page, input, '[data-focus-perimeter]', `sub-habit row ${width}px`)
      await page.emulateMedia({ forcedColors: 'active' })
      await expectOneFieldIndicator(page, input, '[data-focus-perimeter]', `sub-habit row forced colors ${width}px`, { forcedColors: true })
    })

    test('fields draw one indicator in forced colors', async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' })
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
      const composer = await focusConversationComposer(page, width)
      await expectOneFieldIndicator(page, composer, '[data-composer-input-row]', `composer forced colors ${width}px`, { forcedColors: true })

      await page.goto('/search')
      const search = page.locator('[cmdk-input]').first()
      await expectOneFieldIndicator(page, search, 'div.relative', `search forced colors ${width}px`, { forcedColors: true, includeDescendants: true })

      await page.goto('/support')
      const message = page.locator('form textarea').first()
      await expectOneFieldIndicator(page, message, '[data-input-root]', `support forced colors ${width}px`, { forcedColors: true })

      await openCreateForm(page)
      const phrase = page.locator('#habit-phrase')
      await expect(phrase).toBeVisible()
      await expectOneFieldIndicator(page, phrase, '[data-habit-phrase-field]', `create phrase forced colors ${width}px`, { forcedColors: true, includeDescendants: true })
      await page.getByRole('button', { name: messages.habits.form.moreDetails }).click()
      const disclosure = page.locator('.habit-form-disclosure[data-open="true"]')
      await expect(disclosure).toBeVisible()
      const time = disclosure.getByRole('textbox', { name: messages.habits.form.exactTime })
      await expectOneFieldIndicator(page, time, 'input[data-hour-cycle]', `create time forced colors ${width}px`, { forcedColors: true })
    })
  })

  test.describe(`login focus rings at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 }, storageState: { cookies: [], origins: [] } })
    test('Entrar has one ring at each Tab stop', async ({ page }) => {
      await completeInstallOnboarding(page)
      await page.goto('/login')
      await expect(page.getByRole('textbox').first()).toBeVisible()
      await inspectTabStops(page, `Entrar ${width}px`)
      await expectOneFieldIndicator(page, page.locator('input[name="email"]'), '[data-input-root]', `sign-in email ${width}px`)
    })

    test('code entry has one ring on its active box', async ({ page }) => {
      await page.route('**/api/auth/send-code', (route) => route.fulfill({ json: {} }))
      await completeInstallOnboarding(page)
      await page.goto('/login')
      await page.locator('input[name="email"]').fill('focus@example.com')
      await page.getByRole('button', { name: messages.auth.sendCode, exact: true }).click()
      const code = page.locator('input[name="verificationCode"]')
      await expect(code).toBeVisible()
      await expectOneFieldIndicator(page, code, 'form', `sign-in code ${width}px`)
    })

    test('sign-in fields draw one indicator in forced colors', async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' })
      await page.route('**/api/auth/send-code', (route) => route.fulfill({ json: {} }))
      await completeInstallOnboarding(page)
      await page.goto('/login')
      const email = page.locator('input[name="email"]')
      await expectOneFieldIndicator(page, email, '[data-input-root]', `sign-in email forced colors ${width}px`, { forcedColors: true })
      await email.fill('focus@example.com')
      await page.getByRole('button', { name: messages.auth.sendCode, exact: true }).click()
      const code = page.locator('input[name="verificationCode"]')
      await expect(code).toBeVisible()
      await expectOneFieldIndicator(page, code, 'form', `sign-in code forced colors ${width}px`, { forcedColors: true })
    })
  })
}
