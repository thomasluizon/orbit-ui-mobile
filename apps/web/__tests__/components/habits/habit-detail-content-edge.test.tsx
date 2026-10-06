import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { NextIntlClientProvider } from 'next-intl'
import { render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { ShellWide } from '@/components/shell/shell-wide'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const mocks = vi.hoisted(() => ({ isError: false }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), replace: vi.fn() }), usePathname: () => '/habits/habit-1', useParams: () => ({}) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined, isError: mocks.isError, refetch: vi.fn() }) }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))

const cases = [412, 840, 1100, 1352].flatMap((width) => (['pt-BR', 'en'] as const).flatMap((locale) =>
  [false, true].map((isError) => ({ width, locale, isError })),
))

describe('habit detail frame content edge in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(cases)('aligns the frame in $locale at $width with error $isError', async ({ width, locale, isError }) => {
    mocks.isError = isError
    const view = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
      <ShellWide nav={false}><HabitDetailScreen habitId="habit-1" /></ShellWide>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const content = document.querySelector('[data-habit-detail-content]')!
        const back = document.querySelector('header[data-back] button')!
        const style = getComputedStyle(content)
        const bounds = content.getBoundingClientRect()
        const paddingLeft = Number.parseFloat(style.paddingLeft)
        return {
          contentLeft: bounds.left + paddingLeft,
          backLeft: back.getBoundingClientRect().left,
          contentWidth: bounds.width - paddingLeft - Number.parseFloat(style.paddingRight),
        }
      })
      expect(Math.abs(geometry.contentLeft - geometry.backLeft)).toBeLessThanOrEqual(0.5)
      expect(geometry.contentWidth).toBeGreaterThan(0)
      expect(geometry.contentWidth).toBeLessThanOrEqual(620)
    } finally {
      await page.close()
      view.unmount()
    }
  })
})
