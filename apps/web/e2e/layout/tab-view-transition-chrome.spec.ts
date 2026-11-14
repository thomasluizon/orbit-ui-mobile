import { expect, type BrowserContext, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createPaginatedSchema, habitScheduleItemSchema } from '@orbit/shared/types/habit'
import { profileSchema } from '@orbit/shared/types/profile'
import { getAccountDay } from '@orbit/shared/utils'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_FIXED_TIME } from './clock.mjs'
import { setLayoutFixtureSession, setLayoutProfileSession } from './profile-session'
import { test } from './layout-test'

declare global {
  interface Window { orbitHeldTabLegs?: number; orbitLeavingScrollTop?: number }
}

const TAB_PAGE_LEG = '(orbit-tab-page)'
const SHELL_SCROLLER = '[data-shell-scroller]'
const SAMPLE = 24
const LEAVING_SCROLL_OFFSET = 40

async function seedHabits(context: BrowserContext, count: number) {
  const date = getAccountDay(new Date(LAYOUT_FIXED_TIME), 'UTC')
  const items = Array.from({ length: count }, (_, index) => makeHabitScheduleItem({
    id: `tab-transition-habit-${index}`, title: `Read chapter ${index + 1}`, position: index,
    dueDate: date, scheduledDates: [date], children: [], hasSubHabits: false }))
  const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items, page: 1, pageSize: count, totalCount: count, totalPages: 1 })
  const profile = profileSchema.parse({ ...profileFixture, language: 'en', timeZone: 'UTC' })
  await setLayoutProfileSession(context, profile)
  await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile },
    { path: API.habits.count, body: { count } }, { path: API.habits.list, body: habits }])
}

async function recordLeavingScrollOffset(page: Page) {
  await page.evaluate((scrollerSelector) => {
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = (options) => {
      if (typeof options !== 'object') return start(options)
      return start({
        ...options,
        update: () => {
          window.orbitLeavingScrollTop ??= document.querySelector(scrollerSelector)!.scrollTop
          return options.update?.()
        },
      })
    }
  }, SHELL_SCROLLER)
}

async function holdTabLegsAtMidpoint(page: Page) {
  await page.evaluate((legName) => {
    const hold = () => {
      const legs = document.getAnimations().filter((animation) =>
        (animation.effect as KeyframeEffect | null)?.pseudoElement?.endsWith(legName) === true)
      if (legs.length < 2) { requestAnimationFrame(hold); return }
      for (const leg of legs) {
        leg.pause()
        leg.currentTime = Number(leg.effect!.getComputedTiming().duration) / 2
      }
      window.orbitHeldTabLegs = legs.length
    }
    requestAnimationFrame(hold)
  }, TAB_PAGE_LEG)
}

async function finishTabLegs(page: Page) {
  await page.evaluate(async (legName) => {
    for (const animation of document.getAnimations()) {
      if ((animation.effect as KeyframeEffect | null)?.pseudoElement?.endsWith(legName) === true) animation.finish()
    }
    const settled = () => document.getAnimations().every((animation) =>
      (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition') !== true)
    while (!settled()) await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }, TAB_PAGE_LEG)
}

async function sampleCentre(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  expect(box).not.toBeNull()
  return page.screenshot({
    animations: 'allow',
    clip: {
      x: Math.round(box!.x + box!.width / 2 - SAMPLE / 2),
      y: Math.round(box!.y + box!.height / 2 - SAMPLE / 2),
      width: SAMPLE,
      height: SAMPLE,
    },
  })
}

test('the Astra button and the create button stay above both tab page legs at mid-transition at 412px', async ({ page, context }) => {
  await seedHabits(context, 1)
  await page.setViewportSize({ width: 412, height: 915 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/calendar')
  const today = page.locator('[data-shell-tab-bar]').getByRole('link', { name: en.nav.today, exact: true })
  await expect(today).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  await holdTabLegsAtMidpoint(page)
  await today.click()
  await page.waitForFunction(() => window.orbitHeldTabLegs === 2)
  await expect(page.locator('[data-shell-fab] button')).toBeVisible()
  await expect(page.locator('[data-astra-button]')).toBeVisible()
  const held = {
    create: await sampleCentre(page, '[data-shell-fab] button'),
    astra: await sampleCentre(page, '[data-astra-button]'),
  }

  await finishTabLegs(page)
  const settled = {
    create: await sampleCentre(page, '[data-shell-fab] button'),
    astra: await sampleCentre(page, '[data-astra-button]'),
  }
  expect(held.create.equals(settled.create), 'the create button centre is covered at mid-transition').toBe(true)
  expect(held.astra.equals(settled.astra), 'the Astra button centre is covered at mid-transition').toBe(true)
})

test('the leaving page keeps its scroll offset through the exit leg and Today opens at its top at 412px', async ({ page, context }) => {
  await seedHabits(context, 32)
  await page.setViewportSize({ width: 412, height: 640 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/profile')
  await expect(page.getByTestId('profile-settings-group-you')).toBeVisible()
  const today = page.locator('[data-shell-tab-bar]').getByRole('link', { name: en.nav.today, exact: true })
  await expect(today).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const scroller = page.locator(SHELL_SCROLLER)
  const leavingOffset = await scroller.evaluate((element, offset) => {
    element.scrollTop = offset
    return element.scrollTop
  }, LEAVING_SCROLL_OFFSET)
  expect(leavingOffset, 'the Profile page does not scroll at this viewport').toBe(LEAVING_SCROLL_OFFSET)

  await recordLeavingScrollOffset(page)
  await holdTabLegsAtMidpoint(page)
  await today.click()
  await page.waitForFunction(() => window.orbitHeldTabLegs === 2)
  const held = {
    leaving: await page.evaluate(() => window.orbitLeavingScrollTop),
    entering: await scroller.evaluate((element) => element.scrollTop),
  }

  await finishTabLegs(page)
  await expect(page.getByTestId('habit-row').first()).toBeVisible()
  const settled = await scroller.evaluate((element) => element.scrollTop)
  expect(held.leaving, 'the exit leg was captured after the leaving page moved').toBe(leavingOffset)
  expect(held.entering, 'Today is not at its top at mid-transition').toBe(0)
  expect(settled, 'Today is not at its top after the transition').toBe(0)
})
