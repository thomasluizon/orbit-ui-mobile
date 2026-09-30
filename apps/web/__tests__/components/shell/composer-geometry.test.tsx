import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const cases = [320, 360, 412, 450, 480, 600, 1023].flatMap((width) =>
  [en, ptBR].flatMap((messages) => ['', 'Astra '.repeat(10)].map((value) => ({ width, messages, value }))),
)

describe('Composer compact geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  const measurements: { width: number; placeholder: string; composing: boolean; contentWidth: number }[] = []
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => {
    await closeChrome(browserLaunch)
    writeFileSync(join(tmpdir(), 'orbit-composer-widths.json'), JSON.stringify(measurements, null, 2))
  }, 30_000)

  it.each(cases)('keeps usable text at $width with value "$value" and $messages.shell.composer.placeholder', async ({ width, messages, value }) => {
    const { container } = render(<Composer
      state="idle" value={value} suggestions={[]}
      words={messages.shell.composer}
      onChangeValue={vi.fn()} onSend={vi.fn()}
      onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation}
      onVoice={vi.fn()} voiceWords={messages.shell.composer.voice}
      onAttachFile={vi.fn()} onAttachImage={vi.fn()}
      attachWords={{ file: messages.chat.attachFile, image: messages.chat.attachImage, trayLabel: messages.chat.attachFile, remove: (name) => name }}
    />)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const measured = await page.evaluate(() => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-composer-input]')!
        const style = getComputedStyle(input)
        const placeholderStyle = getComputedStyle(input, '::placeholder')
        return {
          contentWidth: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          clientHeight: input.clientHeight,
          scrollHeight: input.scrollHeight,
          placeholderWhiteSpace: placeholderStyle.whiteSpace,
          whiteSpace: style.whiteSpace,
          documentWidth: document.documentElement.scrollWidth,
          controls: [...document.querySelectorAll('button')].map((button) => {
            const bounds = button.getBoundingClientRect()
            return { width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right }
          }),
        }
      })
      measurements.push({ width, placeholder: messages.shell.composer.placeholder, composing: value.length > 0, contentWidth: measured.contentWidth })
      expect(measured.contentWidth, JSON.stringify(measured)).toBeGreaterThanOrEqual(width === 320 ? 140 : 160)
      expect(measured.documentWidth).toBe(width)
      if (!value) {
        expect(measured.scrollHeight, JSON.stringify(measured)).toBe(measured.clientHeight)
        expect(measured.placeholderWhiteSpace).toBe('nowrap')
      } else {
        expect(measured.whiteSpace).toBe('pre-wrap')
      }
      for (const control of measured.controls) {
        expect(control.width).toBeGreaterThanOrEqual(44)
        expect(control.height).toBeGreaterThanOrEqual(44)
        expect(control.left).toBeGreaterThanOrEqual(0)
        expect(control.right).toBeLessThanOrEqual(width)
      }
    } finally { await page.close() }
  })
})
