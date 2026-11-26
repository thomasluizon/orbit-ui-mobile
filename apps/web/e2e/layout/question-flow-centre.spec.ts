import { expect, type Page } from '@playwright/test'
import { API } from '@orbit/shared/api'
import { profileSchema } from '@orbit/shared/types/profile'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { setLayoutFixtureSession } from './profile-session'
import { test } from './upgrade-fixtures'

const CENTRE_TOLERANCE = 8
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const
const HOSTS = [
  { name: 'habit create (route frame)', path: '/habits/new' },
  { name: 'support (overlay frame)', path: '/support' },
] as const

const guidedConfig = {
  ...DEFAULT_CONFIG,
  features: { ...DEFAULT_CONFIG.features, orbit_guided_flows: { enabled: true, planRequirement: null } },
}

async function measureBlockInColumn(page: Page) {
  return page.locator('[data-question-flow]').first().evaluate((flow) => {
    const column = flow.closest('[data-shell-scroller]') ?? flow.closest('[data-flow-screen]')!
    const scroll = flow.querySelector('[data-flow-scroll]')!
    const primary = flow.querySelector('[data-flow-primary]')
    const spaceBottom = primary && !scroll.contains(primary) ? scroll.getBoundingClientRect().bottom : column.getBoundingClientRect().bottom
    const headerBottom = flow.querySelector('header')!.getBoundingClientRect().bottom
    const block = flow.querySelector('[data-flow-scroll] > div')!.getBoundingClientRect()
    return {
      headerBottom, spaceBottom, columnBottom: column.getBoundingClientRect().bottom, flowBottom: flow.getBoundingClientRect().bottom,
      spaceCentre: (headerBottom + spaceBottom) / 2, blockCentre: block.top + block.height / 2, blockTop: block.top,
    }
  })
}

for (const locale of ['en', 'pt-BR'] as const) {
  for (const viewport of VIEWPORTS) {
    for (const host of HOSTS) {
      test.describe(`question flow centre, ${host.name}, ${locale}, ${viewport.width} by ${viewport.height}`, () => {
        test.use({ appLocale: locale, viewport })

        test('centres the block between the header row and the bottom of the column', async ({ page, context }) => {
          const profile = profileSchema.parse({ ...profileFixture, language: locale })
          await setLayoutFixtureSession(context, [
            { path: API.profile.get, body: profile },
            { path: API.config.get, body: guidedConfig },
          ])
          await page.goto(host.path)
          await expect(page.locator('[data-question-flow]').first()).toBeVisible()
          await expect(page.locator('[data-question-flow] h1').first()).toBeVisible()
          await expect.poll(async () => {
            const { flowBottom, columnBottom } = await measureBlockInColumn(page)
            return Math.abs(flowBottom - columnBottom)
          }, { message: 'the flow reaches the bottom of the content column' }).toBeLessThanOrEqual(1)
          await expect.poll(async () => {
            const { blockCentre, spaceCentre } = await measureBlockInColumn(page)
            return Math.abs(blockCentre - spaceCentre)
          }).toBeLessThanOrEqual(CENTRE_TOLERANCE)
          const { headerBottom, blockTop } = await measureBlockInColumn(page)
          expect(blockTop).toBeGreaterThanOrEqual(headerBottom - 1)
        })
      })
    }
  }
}
