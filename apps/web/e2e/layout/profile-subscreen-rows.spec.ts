import { expect, type Locator } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChevronRight, Trash2, User } from '../../components/ui/icons'
import { API } from '@orbit/shared/api'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { profileSchema } from '@orbit/shared/types/profile'
import { profileFixture } from '../../test-support/hermetic/mock-api/fixtures/profile'
import { LAYOUT_ORIGIN } from '../support/env'
import { test } from './upgrade-fixtures'

async function expectGlyph(glyph: Locator, reference: string) {
  await expect(glyph).toHaveAttribute('width', '24')
  await expect(glyph).toHaveAttribute('height', '24')
  expect(await glyph.evaluate((element, markup) => {
    const expected = new DOMParser().parseFromString(markup, 'text/html').querySelector('svg')!
    return element.innerHTML === expected.innerHTML
  }, reference)).toBe(true)
}

async function expectChevron(row: Locator) {
  const chevron = row.locator('svg').last()
  await expectGlyph(chevron, renderToStaticMarkup(createElement(ChevronRight, { size: 24 })))
  await expect(chevron).toHaveAttribute('aria-hidden', 'true')
  const geometry = await chevron.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const slot = element.parentElement!
    const content = slot.parentElement!
    const probe = document.createElement('span')
    probe.style.color = 'var(--fg-3)'
    element.append(probe)
    const foreground = getComputedStyle(probe).color
    probe.remove()
    return { width: rect.width, height: rect.height, right: rect.right, slotRight: slot.getBoundingClientRect().right, contentRight: content.getBoundingClientRect().right, stroke: getComputedStyle(element).stroke, foreground, last: slot === content.lastElementChild }
  })
  expect(geometry).toMatchObject({ width: 24, height: 24, last: true })
  expect(geometry.stroke).toBe(geometry.foreground)
  expect(geometry.slotRight).toBe(geometry.contentRight)
  expect(geometry.right).toBeLessThanOrEqual(geometry.slotRight)
}

for (const width of [320, 412, 1280]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} profile subscreen rows at ${width}px`, () => {
      const profile = profileSchema.parse({ ...profileFixture, language: locale, name: 'Ana Silva', email: 'a@b.co', timeZone: 'America/Sao_Paulo', weekStartDay: 1, uses24HourClock: true })
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: profile })
      test.beforeEach(async ({ context }) => {
        await context.route(`${LAYOUT_ORIGIN}${API.profile.get}`, (route) => route.fulfill({ json: profile }))
      })

      test('aligns all account icons and titles and ends each action with a chevron', async ({ page }) => {
        await page.goto('/profile/account')
        const surface = page.getByTestId('profile-settings-group-account')
        await expect(surface.getByRole('switch', { name: words.profile.analytics.title })).toBeVisible()
        const rows = surface.locator('.orbit-row-list > div')
        await expect(rows).toHaveCount(5)
        await page.evaluate(() => document.fonts.ready)
        const alignment = []
        for (const row of await rows.all()) {
          await expect(row.locator('svg').first()).toHaveAttribute('width', '24')
          alignment.push(await row.evaluate((element) => {
            const icon = element.querySelector('svg')!.getBoundingClientRect()
            const title = element.querySelector('[data-slot="list-row-title"], [data-slot="settings-row-label"]')!
            const text = document.createRange()
            text.selectNodeContents(title)
            return { iconX: icon.x, iconWidth: icon.width, iconHeight: icon.height, titleX: text.getBoundingClientRect().x }
          }))
        }
        for (const row of alignment) expect(row).toEqual(alignment[0])
        expect(alignment[0]).toMatchObject({ iconWidth: 24, iconHeight: 24 })
        const actions = surface.locator('.orbit-list-row-shell')
        await expect(actions).toHaveCount(4)
        for (const row of await actions.all()) {
          await expect(row.locator('svg')).toHaveCount(2)
          await expectChevron(row)
        }
        await expectGlyph(actions.first().locator('svg').first(), renderToStaticMarkup(createElement(User, { size: 24 })))
        const exportTitle = actions.nth(1).locator('[data-slot="list-row-title"]')
        await expect(exportTitle).toHaveText(locale === 'pt-BR' ? words.dataExport.button : words.profile.settingsRows.export)
        expect(await exportTitle.evaluate((element) => {
          const text = document.createRange()
          text.selectNodeContents(element)
          return text.getBoundingClientRect().width <= element.getBoundingClientRect().width + 1 && text.getClientRects().length === 1
        })).toBe(true)
        const trash = actions.last().locator('svg').first()
        await expectGlyph(trash, renderToStaticMarkup(createElement(Trash2, { size: 24 })))
        expect(await trash.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--status-bad)'
          element.parentElement!.append(probe)
          const expected = getComputedStyle(probe).color
          probe.remove()
          return getComputedStyle(element).stroke === expected
        })).toBe(true)
      })

      test('ends the four preference pickers with chevrons and retains inline values', async ({ page }) => {
        await page.goto('/profile/preferences')
        const rows = page.getByTestId('profile-settings-group-preferences').locator('.orbit-list-row-shell')
        await expect(rows).toHaveCount(4)
        await expect(rows.locator('[data-slot="list-row-value"]')).toHaveText([
          profile.timeZone!, words.dates.daysValue.monday, words.settings.clock.hour24,
          locale === 'pt-BR' ? words.profile.language.brazilianPortuguese : 'English',
        ])
        await page.evaluate(() => document.fonts.ready)
        for (const row of await rows.all()) {
          await expect(row.locator('svg')).toHaveCount(1)
          await expectChevron(row)
          const placement = await row.evaluate((element) => {
            const title = element.querySelector('[data-slot="list-row-title"]')!.getBoundingClientRect()
            const value = element.querySelector('[data-slot="list-row-value"]')!.getBoundingClientRect()
            const chevron = element.querySelector('svg')!.getBoundingClientRect()
            return { titleTop: title.top, titleRight: title.right, valueTop: value.top, valueLeft: value.left, valueRight: value.right, chevronLeft: chevron.left }
          })
          expect(Math.abs(placement.titleTop - placement.valueTop)).toBeLessThanOrEqual(1)
          expect(placement.valueLeft).toBeGreaterThanOrEqual(placement.titleRight + 12)
          expect(placement.valueRight).toBeLessThanOrEqual(placement.chevronLeft - 12)
        }
      })
    })
  }
}
