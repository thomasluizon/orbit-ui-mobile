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
    const result = await build({ entryPoints: ['./__tests__/support/habit-reorder-fixture.tsx'],
      bundle: true, write: false, format: 'iife', platform: 'browser', conditions: ['browser'], jsx: 'automatic',
      alias: { '@sentry/nextjs': '@sentry/react' }, define: { 'process.env.NODE_ENV': '"production"', __dirname: '"/"' },
      plugins: [{ name: 'server-boundaries', setup(builder) {
        const boundaries = {
          'next/navigation': 'export const useRouter = () => ({ push() {}, replace() {} }); export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({}); export const unstable_isUnrecognizedActionError = () => false;',
          'next/dynamic': 'export default () => () => null;',
          '@/lib/server-fetch': 'export const serverAuthMutate = async (...args) => window.reorderFixture(...args); export const serverAuthFetch = () => { throw new Error("Unexpected server read"); };'
        };
        builder.onResolve({ filter: /^(next\\/(navigation|dynamic)|@\\/lib\\/server-fetch)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: boundaries[path], loader: 'js' }));
      }}] });
    process.stdout.write(polyfill.outputFiles[0].text + result.outputFiles[0].text);
  `], { maxBuffer: 20 * 1024 * 1024 }).toString()
}, 30_000)
afterAll(async () => { await closeChrome(launch) })

it.each([412, 1280])('keeps real sortable rows visible across a two-row drag at %spx', async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'no-preference' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.route('https://habit-list.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>${stylesheet}</style><div id="root"></div>` }))
    await page.goto('https://habit-list.test/')
    await page.addScriptTag({ content: script })
    const rows = page.locator('[data-testid="habit-row"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 6)
    const source = page.locator('[data-habit-title="Habit 1"] [data-habit-row-body]')
    const target = page.locator('[data-habit-title="Habit 3"]')
    const start = await source.boundingBox()
    const end = await target.boundingBox()
    if (!start || !end) throw new Error('Missing drag rows')
    await page.mouse.move(start.x + 12, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + 12, start.y + start.height / 2 + 8)
    await page.mouse.move(start.x + 12, end.y + end.height / 2, { steps: 20 })
    const during = await rows.evaluateAll((elements) => elements.map((row) => {
      const box = row.getBoundingClientRect()
      const x = box.left + 20
      const visible = [0.1, 0.5, 0.9].some((fraction) => {
        const hit = document.elementFromPoint(x, box.top + box.height * fraction)
        return hit !== null && row.contains(hit)
      })
      return { title: row.getAttribute('data-habit-title'), top: box.top, bottom: box.bottom,
        visible }
    }))
    expect(during.filter((row) => !row.visible), JSON.stringify({ during, errors })).toEqual([])
    await page.mouse.up()
    await page.waitForFunction(() => window.reorderRequests.length === 1)
    await page.waitForFunction(() => [...document.querySelectorAll('[data-habit-title]')].filter((row) => row.getAttribute('data-depth') === '0').map((row) => row.getAttribute('data-habit-title')).join(',') === 'Habit 0,Habit 2,Habit 3,Habit 1,Habit 4')
    await page.waitForFunction(() => {
      const boxes = [...document.querySelectorAll('[data-testid="habit-row"]')].map((row) => row.getBoundingClientRect())
      return boxes.every((box, index) => index === 0 || Math.abs(box.top - boxes[index - 1]!.bottom) <= 13)
    })
    const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom }
    }))
    for (let index = 1; index < geometry.length; index++) expect(geometry[index]!.top - geometry[index - 1]!.bottom).toBeLessThanOrEqual(13)
    await page.evaluate(() => window.reloadReorderFixture())
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 6)
    expect(await rows.evaluateAll((elements) => elements.map((row) => row.getAttribute('data-habit-title')))).toEqual(['Habit 0', 'Child', 'Habit 2', 'Habit 3', 'Habit 1', 'Habit 4'])
    expect(errors).toEqual([])
  } finally { await page.close() }
})
