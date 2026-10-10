import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const language = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', async (importActual) => ({
  ...await importActual<typeof import('next-intl')>(),
  useTranslations: () => createTranslator({ locale: language.value, messages: language.value === 'en' ? en : ptBR }),
}))

describe('Checklist add row geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['dark', 'light'] as const)('keeps separate full field and ghost pill geometry in %s', async (mode) => {
    const page = await browser.newPage()
    try {
      for (const locale of ['en', 'pt-BR']) {
        language.value = locale
        const messages = locale === 'en' ? en : ptBR
        for (const populated of [false, true]) {
          const mounted = render(<HabitChecklist items={populated ? [{ text: 'Prepare coffee', isChecked: false }] : []} editable />)
          const markup = mounted.container.innerHTML
          mounted.unmount()
          const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}: ${value};`).join(' ')
          await page.setContent(`<!doctype html><style>${stylesheet} :root { ${variables} } body { margin: 0; padding: 24px; } main { max-width: 740px; margin: auto; }</style><main>${markup}</main>`)
          for (const width of [320, 412, 1352]) {
            await page.setViewportSize({ width, height: 915 })
            const input = page.getByPlaceholder(messages.habits.form.checklistPlaceholder)
            const add = page.getByRole('button', { name: messages.common.add, exact: true })
            const field = await input.evaluate((element) => {
              const perimeter = element.closest('[data-focus-perimeter]')!
              const bounds = perimeter.getBoundingClientRect()
              const style = getComputedStyle(perimeter)
              return { right: bounds.right, center: bounds.y + bounds.height / 2, height: bounds.height, radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius] }
            })
            const pill = await add.evaluate((element) => {
              const bounds = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              return { left: bounds.left, center: bounds.y + bounds.height / 2, width: bounds.width, height: bounds.height, radius: Number.parseFloat(style.borderTopLeftRadius), background: style.backgroundColor, opacity: style.opacity }
            })
            expect(pill.left - field.right, `${locale} ${width}px gap`).toBe(8)
            expect(field.radii).toEqual(['12px', '12px', '12px', '12px'])
            expect(field.height).toBe(54)
            expect(pill.width).toBe(44)
            expect(pill.height).toBe(44)
            expect(pill.center).toBe(field.center)
            expect(pill.radius).toBeGreaterThanOrEqual(22)
            expect(pill.background).toBe('rgba(0, 0, 0, 0)')
            expect(pill.opacity).toBe('0.4')
            expect(await add.isDisabled()).toBe(true)
          }
        }
      }
    } finally {
      await page.close()
    }
  })
})
