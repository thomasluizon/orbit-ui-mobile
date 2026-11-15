import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
let stylesheet: string
registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(cleanup)
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([390, 1280].flatMap((width) => [en, ptBR].map((messages) => ({ width, messages }))))(
  'centres the drawn Orbit in the composer entry and in the Today line at $width in both locales', async ({ width, messages }) => {
    const { container } = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
      <Composer state="idle" value="" onChangeValue={vi.fn()} onSend={vi.fn()} words={messages.shell.composer} suggestions={[]}
        onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation} />
      <TodayAstraLine text={messages.todayAstra.openConversation} destination={messages.chat.title} onPress={vi.fn()} />
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const surfaces = await page.evaluate(() => [document.querySelector('[data-open-conversation]'), document.querySelector('.today-astra-line')].map((owner) => {
        if (!owner) throw new Error('Missing Orbit surface')
        const mark = owner.querySelector<SVGSVGElement>('[data-asset="orbit-mascot"]')!
        const ink = mark.getBBox()
        const drawnCentre = new DOMPoint(ink.x + ink.width / 2, ink.y + ink.height / 2).matrixTransform(mark.getScreenCTM()!)
        const row = owner.getBoundingClientRect()
        return { face: mark.getAttribute('data-orbit-face'), offset: drawnCentre.y - row.y - row.height / 2 }
      }))
      expect(surfaces.map((surface) => surface.face)).toEqual(['small', 'rig'])
      for (const surface of surfaces) expect.soft(Math.abs(surface.offset)).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  },
)
