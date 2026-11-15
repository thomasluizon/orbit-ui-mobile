import { expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { APPLE_SIGN_IN_BUTTON, SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { test } from './layout-test'
import { loadAppFonts } from '../../__tests__/support/app-fonts'

/** Chromium lays out boxes in 1/64 px units. */
const LAYOUT_UNIT = 1 / 64
let stylesheet: string
let fixtureScript: string

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  const bundle = await build({
    entryPoints: [resolve('e2e/layout/steady-sign-in-column-fixture.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: resolve('tsconfig.json'),
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_APPLE_CLIENT_ID': '"layout-apple-client"' },
    plugins: [{
      name: 'steady-sign-in-flow',
      setup(fixtureBuild) {
        fixtureBuild.onResolve({ filter: /^\.\/use-login-flow$/ }, () => ({ path: resolve('e2e/layout/steady-sign-in-flow.ts') }))
      },
    }],
  })
  fixtureScript = bundle.outputFiles[0]!.text
})

/** The pill, its label and its mark, with the label's overflow past the pill edges or its own box. */
async function readAction(action: Locator) {
  return action.evaluate((pill) => {
    const label = pill.querySelector(':scope > span:not([aria-hidden])')!
    const markSlot = pill.querySelector(':scope > span[aria-hidden]')!.getBoundingClientRect()
    const mark = pill.querySelector('svg')!.getBoundingClientRect()
    const box = pill.getBoundingClientRect()
    const text = label.getBoundingClientRect()
    const style = getComputedStyle(label)
    return {
      height: box.height,
      radius: Math.min(Number.parseFloat(getComputedStyle(pill).borderTopLeftRadius), box.height / 2),
      fontSize: Number.parseFloat(style.fontSize),
      fontFamily: style.fontFamily,
      lines: Math.round(text.height / Number.parseFloat(style.lineHeight)),
      markHeight: mark.height,
      markTop: mark.top - box.top,
      startGap: markSlot.left - box.left,
      endMargin: box.right - text.right,
      width: box.width,
      clipped: label.scrollWidth > label.clientWidth || text.left < box.left || text.right > box.right || text.top < box.top || text.bottom > box.bottom,
    }
  })
}

async function openSignIn(page: Page, locale: string) {
  // WHY: a setContent page has an opaque origin, where document.cookie throws. https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie
  const fixtureUrl = 'http://orbit-layout.test/sign-in-provider-actions-fixture'
  await page.route(fixtureUrl, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="${locale}" data-auth-step="email"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${stylesheet}</style></head><body><div id="steady-sign-in-column-fixture"></div></body></html>`,
  }))
  await page.goto(fixtureUrl)
  await page.addScriptTag({ content: fixtureScript })
  await loadAppFonts(page)
}

for (const width of [320, 360, 384, 412]) {
  for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
    test.describe(`${locale} sign-in provider actions at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })
      test('rest at the small pill height with the Apple title at 43% and wrap whole at 200% text', async ({ page }) => {
        await openSignIn(page, locale)
        const apple = page.getByRole('button', { name: messages.auth.signInWithApple, exact: true })
        const google = page.getByRole('button', { name: messages.auth.signInWithGoogle, exact: true })
        await expect(apple).toBeVisible()

        const [appleAtRest, googleAtRest] = [await readAction(apple), await readAction(google)]
        // WHY: document.fonts.check returns true when no face in the set matches, so only a loaded Geist face proves the file loaded. https://drafts.csswg.org/css-font-loading/#font-face-set-check
        expect(await page.evaluate(() => [...document.fonts].some((face) => face.family.replaceAll('"', '') === 'Geist' && face.status === 'loaded')), 'the Geist file loads').toBe(true)
        expect(appleAtRest.fontFamily, 'the titles render in Geist').toMatch(/^"?Geist"?,/)
        expect(appleAtRest.height, 'Apple pill rests at the small pill height').toBe(SMALL_PILL_VISIBLE_MIN)
        expect(googleAtRest.height, 'Google pill rests at the small pill height').toBe(SMALL_PILL_VISIBLE_MIN)
        expect(appleAtRest.fontSize, 'Apple title follows Apple\'s title-to-height rule').toBe(Math.round(SMALL_PILL_VISIBLE_MIN * APPLE_SIGN_IN_BUTTON.titleToHeight))
        expect(appleAtRest.markHeight, 'Apple logo file is as tall as the pill').toBe(SMALL_PILL_VISIBLE_MIN)
        for (const [name, action] of [['Apple', appleAtRest], ['Google', googleAtRest]] as const) {
          expect(action.radius, `${name} pill is a capsule`).toBe(SMALL_PILL_VISIBLE_MIN / 2)
          expect(action.lines, `${name} title holds one line at default text`).toBe(1)
          expect(action.clipped, `${name} title is whole at default text`).toBe(false)
          expect(Math.abs(action.startGap - action.endMargin), `${name} mark and title rest centred`).toBeLessThanOrEqual(LAYOUT_UNIT)
        }

        await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
        for (const [name, action, rest] of [['Apple', apple, appleAtRest], ['Google', google, googleAtRest]] as const) {
          await expect.poll(async () => (await readAction(action)).fontSize, `${name} title grows with the text size`).toBe(rest.fontSize * 2)
        }
        const [appleLarge, googleLarge] = [await readAction(apple), await readAction(google)]
        for (const [name, rest, large] of [['Apple', appleAtRest, appleLarge], ['Google', googleAtRest, googleLarge]] as const) {
          expect(large.clipped, `${name} title is whole at 200% text`).toBe(false)
          expect(large.height, `${name} pill grows around its wrapped title`).toBeGreaterThan(rest.height)
          expect(large.markTop, `${name} mark stays on the first line`).toBe(rest.markTop)
          expect(large.radius, `${name} pill keeps its resting corner radius`).toBe(SMALL_PILL_VISIBLE_MIN / 2)
        }
        for (const action of [appleAtRest, appleLarge]) {
          expect(action.endMargin, 'Apple title keeps 8% of the width before the trailing edge').toBeGreaterThanOrEqual(action.width * 0.08 - LAYOUT_UNIT)
        }
      })
    })
  }
}
