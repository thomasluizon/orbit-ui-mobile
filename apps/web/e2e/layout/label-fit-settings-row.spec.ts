import { expect } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { SettingsRow } from '../../components/ui/settings-row'
import { SettingsGroupRow } from '../../components/ui/settings-group'
import { expectLabelsFit, markRequiredLabels, markUserText } from './label-fit-contract'
import { expectInteractionFill } from './label-interaction-fill'
import { test } from './upgrade-fixtures'
import { BarChart3, Mail } from '../../components/ui/icons'
import { Switch } from '../../components/ui/switch'
import { loadAppFonts } from '../../__tests__/support/app-fonts'

let stylesheet: string
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
        const markup = renderToStaticMarkup(createElement('main', null,
          createElement(SettingsRow, { label: labels[0], icon: BarChart3, accessory: 'none' }, createElement(Switch, { checked: true, label: labels[0], onChange: () => {} })),
          createElement(SettingsRow, { label: labels[1], icon: Mail, accessory: 'none' }, createElement(Switch, { checked: true, label: labels[1], onChange: () => {} })),
          createElement(SettingsRow, { label: labels[2], accessory: 'none', onClick: () => {} }),
          createElement(SettingsGroupRow, { label: words.trial.expired.proactiveAstra, accessory: 'none' }),
          createElement(SettingsRow, { label: habitName, textMode: 'personal', accessory: 'none' }),
        ))
        await page.setContent(`<style>${stylesheet}</style>${markup}`)
        await loadAppFonts(page)
        await markRequiredLabels(page.locator('[data-slot="settings-row-label"]'))
        await markUserText(page, [habitName])
        await expectLabelsFit(page, page.locator('main'), [habitName])
        const typedRow = page.getByRole('button', { name: habitName, exact: true })
        await expectInteractionFill(page.getByRole('button', { name: labels[2], exact: true }))
        const geometry = await typedRow.locator('[data-slot="settings-row-label"]').evaluate((label) => {
          const row = label.closest('button')!
          const style = getComputedStyle(row)
          return { width: label.getBoundingClientRect().width, available: row.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd), clamp: getComputedStyle(label).webkitLineClamp }
        })
        expect(geometry.width).toBeCloseTo(geometry.available, 0)
        expect(geometry.clamp).toBe('2')
      })

      test('keeps the account label whole beside its live switch at doubled text size', async ({ page }) => {
        await page.goto('/profile/account')
        const label = page.locator('[data-slot="settings-row-label"]').filter({ hasText: words.profile.analytics.title })
        await markRequiredLabels(label)
        await expectLabelsFit(page, label.locator('..'))
        await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
        const geometry = await label.evaluate((element) => ({ clamp: getComputedStyle(element).webkitLineClamp, height: element.clientHeight, scrollHeight: element.scrollHeight, fontSize: parseFloat(getComputedStyle(element).fontSize) }))
        expect(geometry.fontSize).toBe(34)
        expect(geometry.clamp).toBe('none')
        expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
        await expect(page.getByRole('switch', { name: words.profile.analytics.title })).toBeVisible()
      })

      test.describe('expired trial', () => {
        test.use({ layoutProfile: { marketingEmailConsent: true, plan: 'free', isTrialActive: false, trialEndsAt: '2026-09-01T12:00:00Z' } })
        test('keeps paused feature labels whole at both text sizes', async ({ page }) => {
          await page.goto('/profile')
          const dialog = page.getByRole('dialog', { name: words.trial.expired.heading })
          await expect(dialog).toBeVisible()
          await markRequiredLabels(dialog.locator('[data-slot="settings-row-label"]'))
          await expectLabelsFit(page, dialog)
          await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
          for (const label of await dialog.locator('[data-slot="settings-row-label"]').all()) {
            const geometry = await label.evaluate((element) => ({ clamp: getComputedStyle(element).webkitLineClamp, height: element.clientHeight, scrollHeight: element.scrollHeight, fontSize: parseFloat(getComputedStyle(element).fontSize) }))
            expect(geometry.fontSize).toBe(34)
            expect(geometry.clamp).toBe('none')
            expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
          }
        })
      })

      test('renders every product label line when the root text size doubles', async ({ page }) => {
        const label = `${words.trial.expired.calendarSync} ${words.trial.expired.proactiveAstra} ${words.trial.expired.calendarSync}`
        const markup = renderToStaticMarkup(createElement('main', null,
          createElement(SettingsRow, { label, accessory: 'none' }),
          createElement(SettingsGroupRow, { label, accessory: 'none' }),
        ))
        await page.setContent(`<style>${stylesheet}html{font-size:32px}</style>${markup}`)
        await loadAppFonts(page)
        for (const rowLabel of await page.locator('[data-slot="settings-row-label"]').all()) {
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
