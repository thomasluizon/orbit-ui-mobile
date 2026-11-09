import { expect, type Locator } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { test } from './layout-test'

let stylesheet: string
let fixtureScript: string

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  const bundle = await build({
    entryPoints: [resolve('e2e/layout/sign-in-gap-fixture.tsx')], bundle: true, write: false,
    platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: resolve('tsconfig.json'),
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
  })
  fixtureScript = bundle.outputFiles[0]!.text
})

async function measureGap(form: Locator) {
  return form.evaluate(element => {
    const field = element.firstElementChild!.getBoundingClientRect()
    const button = element.querySelector('button[type="submit"]')!.getBoundingClientRect()
    return { distance: button.top - field.bottom, gap: Number.parseFloat(getComputedStyle(element).rowGap) }
  })
}

for (const width of [320, 1440]) {
  for (const locale of ['en', 'pt-BR']) {
    test.describe(`sign-in field spacing in ${locale} at ${width}px`, () => {
      test.use({ viewport: { width, height: 915 } })
      test('keeps one gap without a challenge and one on each side of a visible challenge', async ({ page }) => {
        // WHY: a setContent page has an opaque origin, where document.cookie throws. https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie
        const fixtureUrl = 'http://orbit-layout.test/sign-in-gap-fixture'
        await page.route(fixtureUrl, route => route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><html lang="${locale}"><head><style>${stylesheet}</style></head><body><main id="sign-in-gap-fixture"></main></body></html>`,
        }))
        await page.goto(fixtureUrl)
        await page.addScriptTag({ content: `
          window.turnstile = {
            render(container, options) {
              const frame = document.createElement('iframe');
              frame.title = 'Layout challenge';
              frame.style.cssText = 'display:block;width:0;height:0;border:0';
              container.appendChild(frame);
              container.solveChallenge = () => options.callback('layout-token');
              return 'layout-widget';
            },
            reset() {},
            remove() {}
          };
        ` })
        await page.addScriptTag({ content: fixtureScript })
        await expect(page.locator('section')).toHaveCount(4)
        for (const section of await page.locator('section').all()) {
          const form = section.locator('form')
          const challenge = form.locator('iframe')
          await expect(challenge).toHaveCount(1)
          const quiet = await section.getAttribute('data-quiet') === 'true'
          if (quiet) {
            await expect.poll(() => measureGap(form)).toEqual({ distance: 24, gap: 24 })
            await challenge.evaluate(frame => { frame.style.height = '65px'; frame.style.width = '100%' })
            await expect.poll(() => measureGap(form)).toEqual({ distance: 24 + 65 + 24, gap: 24 })
            const clearance = await challenge.evaluate(frame => {
              const form = frame.closest('form')!
              return {
                before: frame.getBoundingClientRect().top - form.firstElementChild!.getBoundingClientRect().bottom,
                after: form.querySelector('button[type="submit"]')!.getBoundingClientRect().top - frame.getBoundingClientRect().bottom,
              }
            })
            expect(clearance).toEqual({ before: 24, after: 24 })
          }
          await challenge.evaluate(frame => (frame.parentElement as HTMLElement & { solveChallenge: () => void }).solveChallenge())
          await expect.poll(() => measureGap(form)).toEqual({ distance: 24, gap: 24 })
          await challenge.evaluate(frame => { frame.style.height = '65px'; frame.style.width = '100%' })
          await expect.poll(() => measureGap(form)).toEqual({ distance: 24, gap: 24 })
        }
      })
    })
  }
}
