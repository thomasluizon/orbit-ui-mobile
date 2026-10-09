import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PROFILE_SUBMENUS } from '@orbit/shared/utils/profile-navigation'
import { AccountNavigationRow } from '@/app/(app)/profile/_components/account-navigation-row'
import { ListRow } from '@/components/ui/list-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('personal ListRow text in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each((['light', 'dark'] as const).flatMap((mode) => (['body', 'action'] as const).map((kind) => ({ mode, kind }))))('paints the $kind touch press fill in $mode', async ({ mode, kind }) => {
    const markup = renderToStaticMarkup(<ListRow title="Open day" description="Selected day" accessibilityLabel="Open day" href="/?date=2026-09-04"
      action={{ icon: 'chevron-down', label: 'View details', onPress: vi.fn() }} />)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html class="${mode}" style="${variables}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${stylesheet}</style><body>${markup}</body></html>`)
      await page.bringToFront()
      expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
      const session = await page.context().newCDPSession(page)
      const body = page.getByRole('link', { name: 'Open day' })
      const action = page.getByRole('button', { name: 'View details' })
      const control = kind === 'body' ? body : action
      await control.scrollIntoViewIfNeeded()
      await control.evaluate((element) => {
        element.addEventListener('touchstart', () => element.setAttribute('data-test-touch-held', 'true'), { passive: true })
        for (const event of ['touchend', 'touchcancel']) element.addEventListener(event, () => element.removeAttribute('data-test-touch-held'))
      })
      const box = (await control.boundingBox())!
      const gesture = session.send('Input.synthesizeTapGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2, duration: 5000, gestureSourceType: 'touch' })
      try {
        await expect.poll(() => control.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.background = 'var(--bg-hover)'
          probe.style.position = 'fixed'
          probe.style.pointerEvents = 'none'
          document.body.append(probe)
          const expected = getComputedStyle(probe).backgroundColor
          probe.remove()
          return { painted: getComputedStyle(element).backgroundColor === expected, held: element.hasAttribute('data-test-touch-held') }
        }), { message: 'touch press paints --bg-hover without hover media support' }).toEqual({ painted: true, held: true })
        const corners = await control.evaluate((element) => {
          const style = getComputedStyle(element)
          return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius]
        })
        if (control === body) {
          expect(corners).toEqual(['12px', '12px', '12px', '12px'])
          const secondary = await body.locator('[data-slot="list-row-description"]').evaluate((element) => {
            const probe = document.createElement('span')
            probe.style.color = 'var(--fg-2)'
            document.body.append(probe)
            const expected = getComputedStyle(probe).color
            probe.remove()
            return { color: getComputedStyle(element).color, expected }
          })
          expect(secondary.color).toBe(secondary.expected)
        } else {
          expect(corners.every((corner) => Number.parseFloat(corner) >= box.width / 2)).toBe(true)
          expect(await body.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
        }
      } finally {
        await gesture
      }
      await session.detach()
    } finally { await page.close() }
  })

  it.each([1, 2])('gives the composed account row two-line geometry at %s text scale', async (textScale) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div style={{ width: 288 }}><AccountNavigationRow profile={createMockProfile({ name: 'Ana', email: 'a@b.co' })} submenu={PROFILE_SUBMENUS[0]!} /></div>
    </NextIntlClientProvider>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}:root { font-size: ${16 * textScale}px; --fg-3: #777777; }</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const measured = await page.locator('.orbit-list-row-body').evaluate((body) => {
        const email = body.querySelector('[data-slot="list-row-description"]')!
        const style = getComputedStyle(body)
        const emailStyle = getComputedStyle(email)
        return { height: body.getBoundingClientRect().height, minimum: parseFloat(style.minHeight), paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, fontSize: parseFloat(emailStyle.fontSize), color: emailStyle.color }
      })
      expect(measured).toMatchObject({ minimum: 68, paddingTop: '12px', paddingBottom: '12px', fontSize: 14 * textScale, color: 'rgb(119, 119, 119)' })
      if (textScale === 1) expect(Math.abs(measured.height - 68)).toBeLessThanOrEqual(1)
      else expect(measured.height).toBeGreaterThan(68)
    } finally { await page.close() }
  })

  it('keeps each name word on one line in a 288px column and clamps the title to two lines', async () => {
    const name = 'Pessoa com um nome completo escrito no próprio perfil'
    const { container } = render(<div style={{ width: 288 }}>
      <ListRow title={name} description={name} textMode="personal" chevron={false} onClick={vi.fn()} />
    </div>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
        return [title, title.nextElementSibling!].map((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          const texts: Node[] = []
          while (walker.nextNode()) texts.push(walker.currentNode)
          const words = texts.flatMap((text) => Array.from(text.textContent!.matchAll(/\S+/g)).map((match) => {
            const range = document.createRange()
            range.setStart(text, match.index)
            range.setEnd(text, match.index + match[0].length)
            return { word: match[0], lines: range.getClientRects().length }
          }))
          const style = getComputedStyle(element)
          return { words, height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight), clamp: style.webkitLineClamp, overflow: style.overflow }
        })
      })
      for (const block of geometry) {
        for (const word of block.words) expect(word.lines, word.word).toBe(1)
        expect(block.height).toBeLessThanOrEqual(2 * block.lineHeight + 1)
        expect(block.clamp).toBe('2')
        expect(block.overflow).toBe('hidden')
      }
    } finally { await page.close() }
  })

  it.each([`${'longaddress'.repeat(12)}@example.com`, `Ler ${'palavralonga'.repeat(12)} todos os dias`])('keeps oversized tokens intact with tail ellipsis: %s', async (email) => {
    const { container } = render(<div style={{ width: 288 }}>
      <ListRow title={email} description={email} textMode="personal" chevron={false} onClick={vi.fn()} />
    </div>)
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const title = document.querySelector<HTMLElement>('[data-slot="list-row-title"]')!
        return [title, title.nextElementSibling!].map((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const style = getComputedStyle(element)
          const words = Array.from(element.textContent!.matchAll(/\S+/g)).map((match) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
            while (walker.nextNode()) {
              const node = walker.currentNode
              const start = node.textContent!.indexOf(match[0])
              if (start < 0) continue
              const word = document.createRange()
              word.setStart(node, start)
              word.setEnd(node, start + match[0].length)
              return new Set(Array.from(word.getClientRects()).map((rect) => rect.top)).size
            }
            return 0
          })
          return { words, lines: new Set(Array.from(range.getClientRects()).map((rect) => rect.top)).size, height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight) }
        })
      })
      for (const block of geometry) {
        expect(block.words.every((lines) => lines === 1)).toBe(true)
        expect(block.height).toBeLessThanOrEqual(2 * block.lineHeight + 1)
        if (!email.includes(' ')) expect(block.height).toBeCloseTo(block.lineHeight, 0)
      }
    } finally { await page.close() }
  })
})
