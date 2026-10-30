import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { HabitListAllDone } from '@/components/habits/habit-list/empty-state'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('Hoje completion text and action geometry', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async next => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 412, 480, 840, 1100, 1440].flatMap(width => ['en', 'pt-BR'].map(locale => ({ width, locale }))))(
    'pairs the text and separates its action at $width in $locale', async ({ width, locale }) => {
      const messages = locale === 'en' ? en : pt
      const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
        <HabitListAllDone onSeeUpcoming={vi.fn()} />
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => {
          const [title, hint] = document.querySelectorAll('p')
          const action = document.querySelector('button')!.getBoundingClientRect()
          return { textGap: hint!.getBoundingClientRect().top - title!.getBoundingClientRect().bottom,
            actionGap: action.top - hint!.getBoundingClientRect().bottom }
        })
        expect(geometry.textGap).toBe(8)
        expect(geometry.actionGap).toBeGreaterThanOrEqual(24)
      } finally { await page.close() }
    },
  )
})
