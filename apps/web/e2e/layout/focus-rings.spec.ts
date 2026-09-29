import { expect, test, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import messages from '@orbit/shared/i18n/en.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'

async function inspectFocusedRing(page: Page) {
  return page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish()
    const focused = document.activeElement
    if (!(focused instanceof HTMLElement) || focused === document.body) return null

    const describe = (element: Element) => {
      const name = element.getAttribute('aria-label') ?? element.getAttribute('name') ?? ''
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${name ? `[${name}]` : ''}`
    }
    const ancestors: Element[] = []
    let parent = focused.parentElement
    for (let level = 0; level < 6 && parent; level += 1) {
      ancestors.push(parent)
      parent = parent.parentElement
    }
    const indicators = [focused, ...ancestors, ...focused.querySelectorAll('*')]
      .filter((element) => {
        const style = getComputedStyle(element)
        const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
        return outline || style.boxShadow.includes('rgb(196, 83, 15)')
      })
      .map(describe)

    return { focused: describe(focused), focusVisible: focused.matches(':focus-visible'), indicators }
  })
}

async function expectOneRing(page: Page, surface: string, stop: number) {
  const state = await inspectFocusedRing(page)
  expect(state, `${surface} Tab stop ${stop} has a focused control`).not.toBeNull()
  if (!state) return
  expect(state.focusVisible, `${surface} Tab stop ${stop}: ${state.focused} is keyboard-focused`).toBe(true)
  expect(state.indicators, `${surface} Tab stop ${stop}: ${state.focused} drew ${state.indicators.join(', ')}`).toHaveLength(1)
}

async function inspectTabStops(page: Page, surface: string) {
  let focusedStops = 0
  for (let stop = 1; stop <= 45; stop += 1) {
    await page.keyboard.press('Tab')
    const state = await inspectFocusedRing(page)
    if (!state) continue
    focusedStops += 1
    expect(state.focusVisible, `${surface} Tab stop ${stop}: ${state.focused} is keyboard-focused`).toBe(true)
    expect(state.indicators, `${surface} Tab stop ${stop}: ${state.focused} drew ${state.indicators.join(', ')}`).toHaveLength(1)
  }
  expect(focusedStops, `${surface} must expose keyboard controls`).toBeGreaterThan(0)
}

async function openCreateForm(page: Page, width: number) {
  const create = width === 1280
    ? page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.nav.create })
    : page.getByRole('button', { name: messages.habits.createManually })
  await create.click()
}

for (const width of [412, 1280] as const) {
  test.describe(`focus rings at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 } })

    for (const [surface, path, targetSelector] of [
      ['Hoje', '/', '[data-shell-pinned-slot] [data-composer-input]'],
      ['Busca', '/search', '[cmdk-input]'],
      ['Suporte', '/support', 'form textarea'],
      ['Perfil', '/profile', null],
      ['Calendário', '/calendar', null],
      ['Progresso', '/progress', `main button[aria-label="${messages.profile.wrappedTitle}"]`],
    ] as const) {
      test(`${surface} has one ring at each Tab stop`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
        await inspectTabStops(page, `${surface} ${width}px`)
        if (targetSelector === null) return
        const target = page.locator(targetSelector).first()
        await expect(target).toBeVisible()
        await target.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        await expect(target).toBeFocused()
        await expectOneRing(page, `${surface} route control ${width}px`, 0)
      })
    }

    test('palette field and commands have one ring', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
      if (width === 1280) {
        await page.locator('[data-shell-sidebar]').getByRole('button', { name: messages.command.title }).click()
      } else {
        await page.keyboard.press('Control+k')
      }
      const field = page.locator('[cmdk-input]')
      await expect(field).toBeVisible()
      await field.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(field).toBeFocused()
      await expectOneRing(page, `palette field ${width}px`, 0)
      await inspectTabStops(page, `palette ${width}px`)
    })

    test('create habit form has one ring at each Tab stop', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
      await openCreateForm(page, width)
      const phrase = page.locator('#habit-phrase')
      await expect(phrase).toBeVisible()
      await phrase.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(phrase).toBeFocused()
      await expectOneRing(page, `create phrase ${width}px`, 0)
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
      await inspectTabStops(page, `create expanded form ${width}px`)
    })

    test('sub-habit input and remove action each have one ring', async ({ page, context }) => {
      const profile = profileSchema.parse({
        ...profileFixture,
        plan: 'pro',
        hasProAccess: true,
        aiMessagesLimit: 50,
      })
      await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      await page.goto('/')
      await expect(page.getByRole('navigation', { name: messages.nav.mainNavigation })).toBeVisible()
      await openCreateForm(page, width)
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
    })
  })

  test.describe(`login focus rings at ${width}px`, () => {
    test.use({ viewport: { width, height: 915 }, storageState: { cookies: [], origins: [] } })
    test('Entrar has one ring at each Tab stop', async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByRole('textbox').first()).toBeVisible()
      await inspectTabStops(page, `Entrar ${width}px`)
    })
  })
}
