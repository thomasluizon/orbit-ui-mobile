import { controlContrast } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import pt from '@orbit/shared/i18n/pt-BR.json'
import en from '@orbit/shared/i18n/en.json'
import { makeChoiceLayoutBlock, makePickListLayoutBlock } from '@orbit/shared/test-support/choice-layout-fixtures'
import { chatResponseSchema } from '@orbit/shared/types/chat'
import { makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/chat/message-bubble'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: {} }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(cleanup)
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

it.each([320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => [1, 2].map(scale => ({ width, scale, locale })))))(
  'keeps both answer blocks and option lines and habit names at $width and text scale $scale in $locale', async ({ width, scale, locale }) => {
    const reply = chatResponseSchema.parse({ actions: [], parts: [{ type: 'block', kind: 'choice', block: makeChoiceLayoutBlock(locale, false) }, { type: 'block', kind: 'choice', block: makeChoiceLayoutBlock(locale, true) }, { type: 'block', kind: 'pickList', block: makePickListLayoutBlock(locale) }] })
    const { container } = render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : pt}><div style={{ padding: 16, maxWidth: 740 }}><MessageBubble message={makeHeldHabitMessage({ ...reply, pendingOperations: [], content: '' })} /></div></NextIntlClientProvider>)
    expect(container.querySelectorAll('section[data-state]')).toHaveLength(3)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style><div class="dark">${container.innerHTML}</div>`)
      await loadAppFonts(page)
      const measured = await page.evaluate(scale => {
        const textElements = [...document.querySelectorAll<HTMLElement>('[data-answer-block] *')].filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
        const textSizes = textElements.map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), height: parseFloat(getComputedStyle(element).lineHeight) }))
        document.documentElement.style.fontSize = `${16 * scale}px`
        document.documentElement.style.setProperty('--fs-base', `${16 * scale}px`)
        for (const { element, size, height } of textSizes) {
          element.style.fontSize = `${size * scale}px`
          element.style.lineHeight = `${height * scale}px`
        }
        const rows = [...document.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]')]
        return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          rows: rows.map(target => {
            const row = target.closest<HTMLElement>('[data-slot="list-row-body"]') ?? target
            const rect = row.getBoundingClientRect()
            const ranges = [...row.querySelectorAll('span')].flatMap(span => [...span.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).flatMap(node => {
              const range = document.createRange(); range.selectNodeContents(node)
              const personal = span.closest('[data-personal-text]')?.getBoundingClientRect()
              return [...range.getClientRects()].filter(rect => !personal || rect.bottom <= personal.bottom + 1).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }))
            }))
            const label = [...row.querySelectorAll('span')].find(span => [...span.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))!
            const labelBounds = label.getBoundingClientRect()
            const control = (target === row ? target.getAttribute('role') === 'radio' ? target.lastElementChild : target.firstElementChild : target)!.getBoundingClientRect()
            return { controlCenter: control.top + control.height / 2, firstLineCenter: labelBounds.top + parseFloat(getComputedStyle(label).lineHeight) / 2, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, ranges, text: [...row.querySelectorAll('span')].filter(span => [...span.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())).map(span => ({ personal: Boolean(span.closest('[data-personal-text]')), height: span.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(span).lineHeight) })), choice: row.closest('[data-answer-block]')?.getAttribute('data-answer-block') === 'choice', leading: [...row.querySelectorAll('span')].filter(span => [...span.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())).map(span => parseFloat(getComputedStyle(span).lineHeight) / parseFloat(getComputedStyle(span).fontSize)) }
          }) }
      }, scale)
      expect(measured.scroll).toBeLessThanOrEqual(measured.width)
      expect(measured.rows).toHaveLength(6)
      for (const row of measured.rows) {
        expect(row.height).toBeGreaterThanOrEqual(48)
        expect(Math.abs(row.controlCenter - row.firstLineCenter)).toBeLessThanOrEqual(1)
        expect(row.ranges.length).toBeGreaterThan(0)
        expect(Math.min(...row.leading)).toBeGreaterThanOrEqual(1.4)
        if (scale === 1) for (const text of row.text.filter(text => row.choice || !text.personal)) expect(text.height).toBeCloseTo(text.lineHeight, 1)
        for (const text of row.ranges) {
          expect(text.left).toBeGreaterThanOrEqual(row.left - 1)
          expect(text.right).toBeLessThanOrEqual(row.right + 1)
          expect(text.top).toBeGreaterThanOrEqual(row.top - 1)
          expect(text.bottom).toBeLessThanOrEqual(row.bottom + 1)
        }
      }
    } finally { await page.close() }
  },
)

it.each(['light', 'dark'] as const)('keeps proposed label and detail contrast on %s hover', async mode => {
  const reply = chatResponseSchema.parse({ actions: [], parts: [{ type: 'block', kind: 'pickList', block: makePickListLayoutBlock('pt-BR') }] })
  const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><MessageBubble message={makeHeldHabitMessage({ ...reply, pendingOperations: [], content: '' })} /></NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
  try {
    const tokens = resolveWebThemeVariables('orange', mode)
    const variables = Object.entries(tokens).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<html class="${mode}" style="${variables}"><style>${stylesheet}</style><body>${container.innerHTML}</body></html>`)
    const row = page.locator('[data-answer-block="pickList"] [data-slot="list-row-body"]').first()
    const labelArea = row.getByRole('button')
    await labelArea.hover()
    const expectedFill = await row.evaluate(element => {
      const probe = document.createElement('span')
      probe.style.backgroundColor = 'var(--bg-hover)'
      element.append(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    await expect.poll(() => labelArea.evaluate(element => getComputedStyle(element.querySelector('[data-press-fill]')!).backgroundColor)).toBe(expectedFill)
    const measured = await row.evaluate(element => ({
      fill: getComputedStyle(element.querySelector('[data-personal-text-action] [data-press-fill]')!).backgroundColor,
      colors: [...element.querySelectorAll<HTMLElement>('[data-personal-text], [data-slot="check-row-description"]')]
        .filter(text => text.getBoundingClientRect().height > 0).map(text => getComputedStyle(text).color),
    }))
    expect(measured.colors).toHaveLength(2)
    expect(measured.fill).not.toBe('rgba(0, 0, 0, 0)')
    for (const color of measured.colors) expect(controlContrast(color, measured.fill, [tokens['--bg']!, tokens['--bg-card']!]).graphic).toBeGreaterThanOrEqual(4.5)
  } finally { await page.close() }
})
