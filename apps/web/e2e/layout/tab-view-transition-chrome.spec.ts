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
  interface Window { orbitHeldTabLegs?: number }
}

const TAB_PAGE_LEG = '(orbit-tab-page)'
const SAMPLE = 24

async function seedOneHabit(context: BrowserContext) {
  const date = getAccountDay(new Date(LAYOUT_FIXED_TIME), 'UTC')
  const item = makeHabitScheduleItem({ id: 'tab-transition-habit', title: 'Read chapter 1', position: 0,
    dueDate: date, scheduledDates: [date], children: [], hasSubHabits: false })
  const habits = createPaginatedSchema(habitScheduleItemSchema).parse({ items: [item], page: 1, pageSize: 1, totalCount: 1, totalPages: 1 })
  const profile = profileSchema.parse({ ...profileFixture, language: 'en', timeZone: 'UTC' })
  await setLayoutProfileSession(context, profile)
  await setLayoutFixtureSession(context, [{ path: API.profile.get, body: profile },
    { path: API.habits.count, body: { count: 1 } }, { path: API.habits.list, body: habits }])
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
  await seedOneHabit(context)
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
