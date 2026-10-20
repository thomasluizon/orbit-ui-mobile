import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createTranslator } from 'next-intl'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { CheckRow } from '@/components/ui/check-row'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { readControlPaint } from '@/e2e/layout/control-paint'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const loginFlow = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => loginFlow.current }))

describe('visible neighbouring text in the interaction clearance inspector', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: 'Geist'; src: url(data:font/ttf;base64,${font}); } :root { --font-geist: 'Geist'; }`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([320, 412, 600, 1024, 1352].flatMap((width) => (['en', 'pt-BR'] as const).map((locale) => ({ width, locale }))))('keeps the real legal links clear in keyboard focus at $width in $locale', async ({ width, locale }) => {
    const fixture = createLoginScreenFixture('email', locale)
    const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
    loginFlow.current = { ...fixture, t, emailFocusRequest: 0 }
    const markup = renderToStaticMarkup(<main className="flex w-full flex-col items-center"><LoginContent /></main>)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<html style="${variables}"><style>${stylesheet}</style>${markup}</html>`)
      await page.evaluate(() => document.fonts.ready)
      const links = page.getByRole('link')
      expect(await links.count()).toBe(2)
      await page.keyboard.press('Tab')
      for (const link of await links.all()) {
        await link.focus()
        expect(await link.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
        const result = await link.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
        expect(result.hasFill).toBe(true)
        expect(result.violations.filter((violation) => violation.neighbour.startsWith('a['))).toEqual([])
      }
    } finally { await page.close() }
  })

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
      const paint = await checkbox.evaluate(readControlPaint)
      const geometry = await checkbox.evaluate((element, fill) => {
        const label = element.closest('[data-slot="list-row-body"]')!.querySelector('[data-personal-text]')!
        const range = document.createRange()
        range.selectNodeContents(label)
        return { clipped: label.scrollWidth > label.clientWidth, visibleGap: fill.left - label.getBoundingClientRect().right, hiddenTextEnd: range.getBoundingClientRect().right, checkboxStart: fill.left,
          targetWidth: element.getBoundingClientRect().width, fillWidth: fill.right - fill.left }
      }, paint.bounds)
      expect(geometry.clipped).toBe(true)
      expect(geometry.targetWidth).toBe(48)
      expect(geometry.fillWidth).toBe(40)
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
