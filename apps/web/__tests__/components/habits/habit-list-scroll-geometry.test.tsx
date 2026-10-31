import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

let browser: Browser
let launch: BrowserLaunch | undefined
let stylesheet: string
let script: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  const tokens = Object.entries(resolveWebThemeVariables('orange', 'light')).map(([key, value]) => `${key}:${value}`).join(';')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css + `:root{${tokens}}`
  script = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'esbuild';
    const polyfill = await build({ entryPoints: ['next/dist/compiled/process'], bundle: true, write: false,
      format: 'iife', globalName: 'process', platform: 'browser', define: { __dirname: '"/"' } });
    const result = await build({ entryPoints: ['./__tests__/support/habit-list-scroll-fixture.tsx'],
      bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], jsx: 'automatic',
      alias: { '@sentry/nextjs': '@sentry/react' }, define: { 'process.env.NODE_ENV': '"production"', __dirname: '"/"' },
      plugins: [{ name: 'server-boundaries', setup(builder) {
        const boundaries = {
          'next/navigation': 'export const useRouter = () => ({ push() {}, replace() {} }); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({}); export const unstable_isUnrecognizedActionError = () => false;',
          'next/dynamic': 'export default () => () => null;',
          '@/lib/server-fetch': 'export const serverAuthMutate = async (...args) => window.skipScrollFixture(...args); export const serverAuthFetch = () => { throw new Error("Unexpected server read"); };'
        };
        builder.onResolve({ filter: /^(next\\/(navigation|dynamic)|@\\/lib\\/server-fetch)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: boundaries[path], loader: 'js' }));
      }}] });
    process.stdout.write(polyfill.outputFiles[0].text + result.outputFiles[0].text);
  `], { maxBuffer: 20 * 1024 * 1024 }).toString()
}, 30_000)
afterAll(async () => { await closeChrome(launch) })

it.each([
  { reducedMotion: 'no-preference', width: 412, height: 915, fontScale: 1 },
  { reducedMotion: 'reduce', width: 412, height: 915, fontScale: 1 },
  { reducedMotion: 'no-preference', width: 915, height: 412, fontScale: 2 },
  { reducedMotion: 'reduce', width: 915, height: 412, fontScale: 2 },
] as const)('anchors real HabitList bulk skips, motion=$reducedMotion at $width x $height and $fontScale text', async ({ reducedMotion, width, height, fontScale }) => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.route('https://habit-list.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>${stylesheet}</style><div id="root"></div>` }))
    await page.goto('https://habit-list.test/')
    await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%` }, fontScale)
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 30, undefined, { timeout: 5000 })
      .catch(async (cause: unknown) => { throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText() }), { cause }) })
    const before = await page.locator('[data-shell-scroller]').evaluate((element) => {
      element.scrollTop = 650
      return { offset: element.scrollTop, viewport: element.clientHeight, minimum: element.querySelector<HTMLElement>('[data-habit-list]')!.style.minHeight }
    })
    expect(before.offset).toBe(650)
    const observations = page.locator('[data-shell-scroller]').evaluate((element) => new Promise<{ departures: number; offsets: number[]; minimum: string; remaining: number; viewport: number }>((done) => {
      const offsets: number[] = []
      let departures = 0
      const start = performance.now()
      let departureStarted: number | undefined
      const sample = () => {
        offsets.push(element.scrollTop)
        departures = Math.max(departures, element.querySelectorAll('[data-list-motion][inert] [data-testid="habit-row"]').length)
        if (departures > 0) departureStarted ??= performance.now()
        const remaining = element.querySelectorAll('[data-testid="habit-row"]').length
        const settled = remaining === 0 && departureStarted !== undefined && performance.now() - departureStarted > 1000
        if (settled || performance.now() - start > 5000) done({ departures, offsets, remaining, viewport: element.clientHeight, minimum: element.querySelector<HTMLElement>('[data-habit-list]')!.style.minHeight })
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }))
    await page.getByRole('button', { name: 'Skip selected', exact: true }).click()
    const observed = await observations
    expect(observed.departures, JSON.stringify({ observed, errors })).toBe(30)
    expect(observed.remaining).toBe(0)
    expect(observed.offsets.every((offset) => Math.abs(offset - 650) < 1), JSON.stringify({ before, observed })).toBe(true)
    await page.locator('[data-shell-scroller]').evaluate((element) => { element.scrollTop = 0 })
    await page.waitForFunction(() => {
      const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
      return scroller.scrollTop === 0 && Number.parseFloat(scroller.querySelector<HTMLElement>('[data-habit-list]')!.style.minHeight) <= scroller.clientHeight
    }, undefined, { timeout: 5000 })
    expect(errors).toEqual([])
  } finally { await page.close() }
})
