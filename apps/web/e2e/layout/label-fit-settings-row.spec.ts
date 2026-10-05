import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'
import { renderSettingsRowMarkup } from './settings-row-markup'
import { loadAppFonts } from '../../__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '../../lib/theme-dom'

async function doubleTextSize(page: Page) {
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
}

let stylesheet: string
const themeTokens = `:root { ${Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([property, value]) => `${property}: ${value};`).join(' ')} }`

function settingsPage(markup: string, extraCss = '') {
  return `<!doctype html><html class="dark"><head><meta charset="utf-8"><style>${stylesheet}${themeTokens}${extraCss}</style></head><body>${markup}</body></html>`
}

test.beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})

for (const width of [320, 360, 384, 412]) {
  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} settings row text at ${width}px`, () => {
      test.use({ appLocale: locale, viewport: { width, height: 915 }, layoutProfile: { marketingEmailConsent: true } })

      test('keeps product labels whole and gives typed names the full row width', async ({ page }) => {
        const habitName = 'Caminhar pelo bairro depois do trabalho e conversar com todos os amigos durante os encontros da semana'
        const labels = [words.profile.analytics.title, words.profile.marketingEmails.title, words.trial.expired.calendarSync] as const
        const markup = renderSettingsRowMarkup([...labels, words.trial.expired.proactiveAstra], habitName)
        await page.setContent(settingsPage(markup))
        await loadAppFonts(page)
        for (const label of [...labels, words.trial.expired.proactiveAstra]) {
          await markRequiredLabels(page.getByText(label, { exact: true }))
        }
        await markUserText(page, [habitName])
        await expectLabelsFit(page, page.locator('main'), [habitName])
        const typedRow = page.locator('[data-personal-text-action]').filter({ has: page.getByRole('button', { name: habitName, exact: true }) })
        await expectInteractionFill(page.getByRole('button', { name: labels[2], exact: true }))
        const geometry = await typedRow.getByText(habitName, { exact: true }).evaluate((label) => {
          const row = label.closest('[data-personal-text-content]')!
          const style = getComputedStyle(row)
          return { width: label.getBoundingClientRect().width, available: row.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd), clamp: getComputedStyle(label).webkitLineClamp }
        })
        expect(geometry.width).toBeCloseTo(geometry.available, 0)
        expect(geometry.clamp).toBe('2')
        await doubleTextSize(page)
        const marketingLabel = page.getByText(labels[1], { exact: true })
        await expect(marketingLabel).toHaveCSS('font-size', '34px')
        const enlargedMarketing = await marketingLabel.evaluate((label) => ({ fontSize: parseFloat(getComputedStyle(label).fontSize), clamp: getComputedStyle(label).webkitLineClamp, height: label.clientHeight, scrollHeight: label.scrollHeight }))
        expect(enlargedMarketing.fontSize).toBe(34)
        expect(enlargedMarketing.clamp).toBe('none')
        expect(enlargedMarketing.scrollHeight).toBeLessThanOrEqual(enlargedMarketing.height)
        await expect(page.getByRole('switch', { name: labels[1], exact: true })).toBeVisible()
        const enlargedTyped = await typedRow.getByText(habitName, { exact: true }).evaluate((label) => {
          const row = label.closest('[data-personal-text-content]')!
          const style = getComputedStyle(row)
          const labelStyle = getComputedStyle(label)
          return { fontSize: parseFloat(labelStyle.fontSize), width: label.getBoundingClientRect().width, available: row.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd), clamp: labelStyle.webkitLineClamp, height: label.clientHeight, scrollHeight: label.scrollHeight, lineHeight: parseFloat(labelStyle.lineHeight) }
        })
        expect(enlargedTyped.fontSize).toBe(34)
        expect(enlargedTyped.width).toBeCloseTo(enlargedTyped.available, 0)
        expect(enlargedTyped.clamp).toBe('2')
        expect(enlargedTyped.height).toBeLessThanOrEqual(2 * enlargedTyped.lineHeight + 1)
        expect(enlargedTyped.scrollHeight).toBeGreaterThan(enlargedTyped.height)
      })

      test('keeps the account label whole beside its live switch at doubled text size', async ({ page }) => {
        await page.goto('/profile/account')
        const label = page.getByText(words.profile.analytics.title, { exact: true })
        await markRequiredLabels(label)
        await expectLabelsFit(page, label.locator('..'))
        await doubleTextSize(page)
        await expect(label).toHaveCSS('font-size', '34px')
        const geometry = await label.evaluate((element) => ({ clamp: getComputedStyle(element).webkitLineClamp, height: element.clientHeight, scrollHeight: element.scrollHeight, fontSize: parseFloat(getComputedStyle(element).fontSize) }))
        expect(geometry.fontSize).toBe(34)
        expect(geometry.clamp).toBe('none')
        expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
        await expect(page.getByRole('switch', { name: words.profile.analytics.title })).toBeVisible()
      })

      test.describe('expired trial', () => {
        test.use({ storageState: { cookies: [], origins: [] }, layoutProfile: { marketingEmailConsent: true, plan: 'free', isTrialActive: false, trialEndsAt: '2026-09-01T12:00:00Z' } })
        test('keeps paused feature labels whole at both text sizes', async ({ page }) => {
          await page.goto('/profile')
          const dialog = page.getByRole('dialog', { name: words.trial.expired.heading })
          await expect(dialog).toBeVisible()
          const labels = [words.trial.expired.astraCeiling, words.trial.expired.calendarSync, words.trial.expired.retrospective, words.trial.expired.proactiveAstra]
          for (const label of labels) await markRequiredLabels(dialog.getByText(label, { exact: true }))
          await expectLabelsFit(page, dialog)
          await doubleTextSize(page)
          for (const text of labels) {
            const label = dialog.getByText(text, { exact: true })
            await expect(label).toHaveCSS('font-size', '34px')
            const geometry = await label.evaluate((element) => ({ clamp: getComputedStyle(element).webkitLineClamp, height: element.clientHeight, scrollHeight: element.scrollHeight, fontSize: parseFloat(getComputedStyle(element).fontSize) }))
            expect(geometry.fontSize).toBe(34)
            expect(geometry.clamp).toBe('none')
            expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
          }
        })
      })

      test('renders every product label line when the root text size doubles', async ({ page }) => {
        const label = `${words.trial.expired.calendarSync} ${words.trial.expired.proactiveAstra} ${words.trial.expired.calendarSync}`
        const markup = renderSettingsRowMarkup([label])
        await page.setContent(settingsPage(markup, 'html{font-size:32px}'))
        await loadAppFonts(page)
        for (const rowLabel of await page.getByText(label, { exact: true }).all()) {
          const geometry = await rowLabel.evaluate((element) => {
            const style = getComputedStyle(element)
            return { fontSize: parseFloat(style.fontSize), clamp: style.webkitLineClamp, height: element.clientHeight, scrollHeight: element.scrollHeight, lineHeight: parseFloat(style.lineHeight) }
          })
          expect(geometry.fontSize).toBe(34)
          expect(geometry.clamp).toBe('none')
          expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
          if (width === 320) expect(geometry.height).toBeGreaterThan(2 * geometry.lineHeight)
        }
      })
    })
  }
}
