import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { CheckRow } from '@/components/ui/check-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('visible neighbouring text in the interaction clearance inspector', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412])('accepts the real truncated personal CheckRow at %s', async (width) => {
    const label = 'A'.repeat(100)
    const markup = renderToStaticMarkup(<CheckRow placement="column" textMode="personal" checked label={label} onChange={vi.fn()} onOpenLabel={vi.fn()} />)
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${variables}"><style>${stylesheet}</style><body style="padding:32px">${markup}</body></html>`)
      const checkbox = page.getByRole('checkbox', { name: label, exact: true })
      await checkbox.hover()
      await checkbox.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)) })
      const geometry = await checkbox.evaluate((element) => {
        const label = element.closest('[data-slot="list-row-body"]')!.querySelector('[data-personal-text]')!
        const range = document.createRange()
        range.selectNodeContents(label)
        return { clipped: label.scrollWidth > label.clientWidth, visibleGap: element.getBoundingClientRect().left - label.getBoundingClientRect().right, hiddenTextEnd: range.getBoundingClientRect().right, checkboxStart: element.getBoundingClientRect().left }
      })
      expect(geometry.clipped).toBe(true)
      expect(geometry.visibleGap).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
      expect(geometry.hiddenTextEnd).toBeGreaterThan(geometry.checkboxStart)
      const result = await checkbox.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.violations).toEqual([])
    } finally { await page.close() }
  })

  it.each(['visible', 'hidden', 'clip', 'auto', 'scroll'])('measures nested text with overflow %s', async (overflow) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px; font: 16px monospace }
        section { position: relative; width: 100px; height: 24px; overflow: ${overflow} }
        span { white-space: nowrap }
        button { position: absolute; left: 140px; top: 32px; width: 48px; height: 24px; border: 0; outline: none; background: gray }
      </style><section><div><span>${'A'.repeat(100)}</span></div></section><button aria-label="Check"></button>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour.startsWith('span['))).toBe(overflow === 'visible')
    } finally { await page.close() }
  })

  it.each([false, true])('clips block overflow without hiding a visible collision (hidden=%s)', async (hidden) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px; font: 16px/24px monospace }
        section { height: 24px; overflow: ${hidden ? 'hidden' : 'visible'} }
        span { display: block; padding-top: 48px }
        button { position: absolute; left: 32px; top: 80px; width: 48px; height: 24px; border: 0; outline: none; background: gray }
      </style><section><span>Visible text</span></section><button aria-label="Check"></button>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour === 'span[Visible text]')).toBe(!hidden)
    } finally { await page.close() }
  })
})
