import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { test } from './layout-test'

type CheckState = 'none' | 'loading' | 'challenge'
interface LayoutChallenge {
  frame: HTMLIFrameElement
  options: { callback: (token: string) => void; 'before-interactive-callback': () => void; 'after-interactive-callback': () => void }
}

const CHALLENGE_HEIGHT = 65
const CHECK_SPACE: Record<CheckState, (space: number) => boolean> = {
  none: (space) => space === 0,
  loading: (space) => space > 0,
  challenge: (space) => space >= CHALLENGE_HEIGHT,
}
const FAKE_TURNSTILE = `
  window.turnstile = {
    render(container, options) {
      const frame = document.createElement('iframe');
      frame.title = 'Layout challenge';
      frame.style.cssText = 'display:block;width:100%;height:0;border:0';
      container.appendChild(frame);
      window.layoutChallenge = { frame, options };
      return 'layout-widget';
    },
    reset() {},
    remove() {}
  };
`

let stylesheet: string
let fixtureScript: string

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  const bundle = await build({
    entryPoints: [resolve('e2e/layout/steady-sign-in-column-fixture.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: resolve('tsconfig.json'),
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'steady-sign-in-flow',
      setup(fixtureBuild) {
        fixtureBuild.onResolve({ filter: /^\.\/use-login-flow$/ }, () => ({ path: resolve('e2e/layout/steady-sign-in-flow.ts') }))
      },
    }],
  })
  fixtureScript = bundle.outputFiles[0]!.text
})

async function showCheck(page: Page, check: CheckState, height: number) {
  await page.evaluate(({ check: state, height: frameHeight }) => {
    const { frame, options } = (window as Window & { layoutChallenge?: LayoutChallenge }).layoutChallenge!
    frame.style.height = `${frameHeight}px`
    if (state === 'none') options.callback('layout-token')
    else if (state === 'challenge') options['before-interactive-callback']()
    else options['after-interactive-callback']()
  }, { check, height })
}

async function readSignIn(page: Page) {
  return page.evaluate(() => {
    const { frame } = (window as Window & { layoutChallenge?: LayoutChallenge }).layoutChallenge!
    const check = frame.closest('form > *')!
    const panel = document.querySelector('[data-field-surface="responsive-card"]')!.getBoundingClientRect()
    const main = document.querySelector('main')!
    const mainBox = main.getBoundingClientRect()
    const mainStyle = getComputedStyle(main)
    return {
      top: panel.top + scrollY,
      gapAbove: panel.top - mainBox.top - Number.parseFloat(mainStyle.paddingTop),
      gapBelow: mainBox.bottom - Number.parseFloat(mainStyle.paddingBottom) - panel.bottom,
      checkSpace: getComputedStyle(check).position === 'absolute' ? 0 : check.getBoundingClientRect().height,
    }
  })
}

async function nextFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
  for (const [locale, messages] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const step of ['email', 'code'] as const) {
      test.describe(`${locale} ${step} sign-in column at ${viewport.width} by ${viewport.height}`, () => {
        test.use({ viewport })
        test('keeps the column still while the check appears, changes state and leaves', async ({ page }) => {
          // WHY: a setContent page has an opaque origin, where document.cookie throws. https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie
          const fixtureUrl = 'http://orbit-layout.test/steady-sign-in-column-fixture'
          await page.route(fixtureUrl, route => route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><html lang="${locale}" data-auth-step="${step}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${stylesheet}</style></head><body><div id="steady-sign-in-column-fixture"></div></body></html>`,
          }))
          await page.goto(fixtureUrl)
          await page.addScriptTag({ content: FAKE_TURNSTILE })
          await page.addScriptTag({ content: fixtureScript })
          await expect.poll(() => page.evaluate(() => 'layoutChallenge' in window)).toBe(true)

          await showCheck(page, 'none', 0)
          await expect.poll(async () => CHECK_SPACE.none((await readSignIn(page)).checkSpace)).toBe(true)
          await nextFrames(page)
          const resting = await readSignIn(page)
          expect(resting.gapAbove, `${locale} ${step} column starts inside the page`).toBeGreaterThanOrEqual(0)
          expect(Math.abs(resting.gapAbove - resting.gapBelow), `${locale} ${step} column is centred without a check`).toBeLessThanOrEqual(1)

          for (const [check, height] of [['loading', 0], ['challenge', CHALLENGE_HEIGHT], ['loading', 0], ['none', 0]] as const) {
            await showCheck(page, check, height)
            if (check === 'loading') await expect(page.getByText(messages.auth.turnstileLoading, { exact: true })).toBeVisible()
            await expect.poll(async () => CHECK_SPACE[check]((await readSignIn(page)).checkSpace), `${locale} ${step} check takes the ${check} space`)
              .toBe(true)
            await expect.poll(async () => (await readSignIn(page)).top, `${locale} ${step} column stays put with the ${check} check`)
              .toBeCloseTo(resting.top, 0)
            await nextFrames(page)
            expect((await readSignIn(page)).top, `${locale} ${step} column holds its place with the ${check} check`).toBeCloseTo(resting.top, 0)
          }
        })
      })
    }
  }
}
