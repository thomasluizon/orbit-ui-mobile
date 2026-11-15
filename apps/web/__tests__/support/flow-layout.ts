import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { vi } from 'vitest'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from './app-fonts'
import type { Browser } from './chromium'

export const FLOW_WIDTHS = [320, 360, 384, 412] as const
export const FLOW_LOCALES = ['pt-BR', 'en'] as const
export const FLOW_HEIGHT = 915

export interface FlowLayout {
  /** The space the block is centred in, and the block. Null when the markup holds neither. */
  free: { top: number; bottom: number } | null
  block: { top: number; bottom: number } | null
  /** The drawn lines of the question, and of the Orbit line that describes it. */
  questionLines: number
  orbitLineLines: number
  /** Each button that shows words, with the lines its words take. */
  labels: { label: string; lines: number }[]
}

/** The app stylesheet, compiled once for a suite. */
export async function compileAppStylesheet(): Promise<string> {
  const source = resolve('app/globals.css')
  return (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
}

/** The viewport queries of a still render at one width: reduced motion on, and each `min-width` query answered by the width. */
export function stubViewportMedia(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') || width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? Number.POSITIVE_INFINITY),
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }))
}

/**
 * Lays the markup out in Chromium at one width with the app fonts and reads the centring and the label lines.
 * The free area is `[data-layout-free]` or the scroll area of the flow; the block is `[data-layout-block]` or the step block.
 */
export async function measureFlowMarkup(browser: Browser, stylesheet: string, width: number, markup: string, height = FLOW_HEIGHT): Promise<FlowLayout> {
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width, height } })
  try {
    const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body style="margin:0"><div class="flex h-dvh flex-col">${markup}</div></body></html>`)
    await loadAppFonts(page)
    return await page.evaluate(() => {
      /** Only text boxes count, and a box starts a new line only when its top is more than half a line under the last one, so boxes on one line never read as two. */
      const lineCount = (element: Element | null) => {
        if (!element) return 0
        const tops: number[] = []
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top)
        }
        tops.sort((first, second) => first - second)
        return tops.filter((top, index) => index === 0 || top - tops[index - 1]! > 8).length
      }
      const bounds = (element: Element | null) => {
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom }
      }
      const flow = document.querySelector('[data-question-flow]')
      const question = document.querySelector('h1')
      const describedBy = question?.getAttribute('aria-describedby')
      return {
        free: bounds(document.querySelector('[data-layout-free]') ?? flow?.querySelector('main') ?? null),
        block: bounds(document.querySelector('[data-layout-block]') ?? flow?.querySelector('main > [role="presentation"]') ?? null),
        questionLines: lineCount(question),
        orbitLineLines: lineCount(describedBy ? document.getElementById(describedBy) : null),
        labels: [...document.querySelectorAll('button')].filter((button) => button.textContent.trim())
          .map((button) => ({ label: button.textContent.trim(), lines: lineCount(button) })),
      }
    })
  } finally { await page.close() }
}

/** The distance between the centre of the block and the centre of its free area. A block taller than the area starts at its top and scrolls. */
export function centreOffset(layout: FlowLayout): number {
  if (!layout.free || !layout.block) throw new Error('The markup holds no free area or no block.')
  if (layout.block.bottom - layout.block.top >= layout.free.bottom - layout.free.top) return Math.max(0, layout.free.top - layout.block.top)
  return Math.abs((layout.block.top + layout.block.bottom) / 2 - (layout.free.top + layout.free.bottom) / 2)
}
