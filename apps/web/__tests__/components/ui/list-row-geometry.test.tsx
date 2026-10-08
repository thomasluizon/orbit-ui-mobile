import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { ListRow } from '@/components/ui/list-row'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

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
