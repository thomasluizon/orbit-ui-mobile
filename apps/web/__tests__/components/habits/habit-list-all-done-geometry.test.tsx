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

  it.each([320, 360, 384, 412, 740, 1440].flatMap(width => ['en', 'pt-BR'].flatMap(locale =>
    (['reduce', 'no-preference'] as const).map(reducedMotion => ({ width, locale, reducedMotion })))))(
    'centres the finish state at $width in $locale with $reducedMotion motion', async ({ width, locale, reducedMotion }) => {
      const messages = locale === 'en' ? en : pt
      const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
        <HabitListAllDone onSeeUpcoming={vi.fn()} />
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion })
      try {
        await page.setContent(`<style>${stylesheet}</style><main style="max-width:740px;margin:auto;padding:16px">${container.innerHTML}</main>`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => {
          const [title, hint] = document.querySelectorAll('p')
          const action = document.querySelector('button')!.getBoundingClientRect()
          const finish = document.querySelector('[data-testid="habit-list-all-done"]')!.getBoundingClientRect()
          const mark = document.querySelector('[data-asset="orbit-mark-16"]')?.getBoundingClientRect()
          const ring = document.querySelector('[data-testid="completed-day-mark"]')?.getBoundingClientRect()
          const text = [title!, hint!, document.querySelector('button')!].map(element => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
            const rects: DOMRect[] = []
            while (walker.nextNode()) {
              const range = document.createRange()
              range.selectNodeContents(walker.currentNode)
              rects.push(...[...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0))
            }
            return { lines: new Set(rects.map(rect => rect.top)).size,
              left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)) }
          })
          return { textGap: hint!.getBoundingClientRect().top - title!.getBoundingClientRect().bottom,
            actionGap: action.top - hint!.getBoundingClientRect().bottom,
            finish: { left: finish.left, right: finish.right, centre: finish.left + finish.width / 2 },
            mark: mark && { width: mark.width, height: mark.height, centre: mark.left + mark.width / 2 },
            ring: ring && { width: ring.width, height: ring.height, centre: ring.left + ring.width / 2 },
            actionCentre: action.left + action.width / 2, text,
            animations: document.getAnimations().length }
        })
        expect(geometry.mark).toMatchObject({ width: 16, height: 16 })
        expect(geometry.ring).toMatchObject({ width: 44, height: 44 })
        expect(geometry.mark!.centre).toBeCloseTo(geometry.finish.centre, 0)
        expect(geometry.ring!.centre).toBeCloseTo(geometry.finish.centre, 0)
        expect(geometry.actionCentre).toBeCloseTo(geometry.finish.centre, 0)
        for (const text of geometry.text) {
          expect(text.lines).toBe(1)
          expect(text.left).toBeGreaterThanOrEqual(geometry.finish.left + 24)
          expect(text.right).toBeLessThanOrEqual(geometry.finish.right - 24)
        }
        expect(geometry.animations).toBe(0)
        expect(geometry.textGap).toBe(8)
        expect(geometry.actionGap).toBeGreaterThanOrEqual(24)
      } finally { await page.close() }
    },
  )
})
