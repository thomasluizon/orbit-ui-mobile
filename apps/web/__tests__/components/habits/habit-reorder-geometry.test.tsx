import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
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

const cases = [320, 360, 384, 412, 600, 768, 1280].flatMap((width) => (['light', 'dark'] as const).flatMap((mode) =>
  ['Habit 1', 'Habit 0'].map((title) => ({ width, mode, title }))))

it.each(cases)('keeps $title visible across a two-row drag at $width px in $mode', async ({ width, mode, title }) => {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'no-preference' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    await page.route('https://habit-list.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${mode}"><style>${stylesheet}:root{${variables}}</style><div id="root"></div>` }))
    await page.goto('https://habit-list.test/')
    await loadAppFonts(page)
    await page.addScriptTag({ content: script })
    const rows = page.locator('[data-testid="habit-row"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 6)
    const source = page.locator(`[data-habit-title="${title}"]`)
    const target = page.locator(`[data-habit-title="${title === 'Habit 0' ? 'Habit 2' : 'Habit 3'}"]`)
    const expected = title === 'Habit 0' ? ['Habit 1', 'Habit 2', 'Habit 0', 'Child', 'Habit 3', 'Habit 4']
      : ['Habit 0', 'Child', 'Habit 2', 'Habit 3', 'Habit 1', 'Habit 4']
    let start = await source.locator('[data-habit-row-body]').boundingBox()
    if (!start) throw new Error('Missing drag row')
    if (title === 'Habit 0') {
      await page.mouse.move(start.x + 12, start.y + start.height / 2)
      await page.mouse.down()
      await page.mouse.move(start.x + 12, start.y + start.height / 2 + 8)
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 5)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 6, undefined, { timeout: 1000 })
      expect(await page.evaluate(() => window.reorderRequests)).toEqual([])
      start = await source.locator('[data-habit-row-body]').boundingBox()
      if (!start) throw new Error('Missing restored parent')
    }
    const sourceCenter = await source.evaluate((row) => {
      const box = row.parentElement!.parentElement!.getBoundingClientRect()
      return box.top + box.height / 2
    })
    await page.mouse.move(start.x + 12, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + 12, start.y + start.height / 2 + 8)
    if (title === 'Habit 0') await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 5, undefined, { timeout: 2000 })
    const end = await target.evaluate((row) => {
      const sortable = row.parentElement!.parentElement!
      const box = sortable.getBoundingClientRect()
      const transform = new DOMMatrixReadOnly(getComputedStyle(sortable).transform)
      return box.top - transform.m42 + box.height / 2
    })
    await page.mouse.move(start.x + 12, start.y + start.height / 2 + end - sourceCenter, { steps: 20 })
    const during = await rows.evaluateAll(async (elements) => {
      await new Promise(requestAnimationFrame)
      return elements.map((row) => {
        const sortable = row.parentElement!.parentElement!
        const box = sortable.getBoundingClientRect()
        const x = box.left + 20
        const visible = [0.1, 0.5, 0.9].some((fraction) => {
          const hit = document.elementFromPoint(x, box.top + box.height * fraction)
          return hit !== null && row.contains(hit)
        })
        let opaque = true
        for (let node: Element | null = row; node; node = node.parentElement) opaque &&= getComputedStyle(node).opacity === '1' || (node.hasAttribute('data-sortable-dragging') && getComputedStyle(node).opacity === '0.5')
        return { id: row.getAttribute('data-habit-id')!, title: row.getAttribute('data-habit-title'), top: box.top, bottom: box.bottom, visible: visible && opaque }
      })
    })
    expect(during.filter((row) => !row.visible), JSON.stringify({ during, errors })).toEqual([])
    const preview = during.filter((row) => row.id.startsWith('root-')).sort((first, second) => first.top - second.top)
    await page.mouse.up()
    await page.waitForFunction(() => window.reorderRequests.length === 1, undefined, { timeout: 2000 })
    expect(await page.evaluate(() => window.reorderRequests[0]!.positions)).toEqual(preview.map((row, position) => ({ habitId: row.id, position })))
    expect(preview.map((row) => row.title)).toEqual(expected.filter((title) => title !== 'Child'))
    await page.waitForFunction((titles) => [...document.querySelectorAll('[data-testid="habit-row"]')].map((row) => row.getAttribute('data-habit-title')).join(',') === titles.join(','), expected, { timeout: 2000 }).catch(async (cause: unknown) => {
      throw new Error(JSON.stringify({ expected, actual: await rows.evaluateAll((elements) => elements.map((row) => row.getAttribute('data-habit-title'))), requests: await page.evaluate(() => window.reorderRequests) }), { cause })
    })
    await page.waitForFunction(() => {
      const boxes = [...document.querySelectorAll('[data-testid="habit-row"]')].map((row) => row.getBoundingClientRect())
      return boxes.every((box, index) => index === 0 || (box.top - boxes[index - 1]!.bottom >= 7 && box.top - boxes[index - 1]!.bottom <= 13))
    }, undefined, { timeout: 2000 }).catch(async (cause: unknown) => {
      throw new Error(JSON.stringify(await rows.evaluateAll((elements) => elements.map((row) => { const box = row.getBoundingClientRect(); return { title: row.getAttribute('data-habit-title'), top: box.top, bottom: box.bottom } }))), { cause })
    })
    const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom }
    }))
    for (let index = 1; index < geometry.length; index++) expect(geometry[index]!.top - geometry[index - 1]!.bottom).toBeLessThanOrEqual(13)
    await page.evaluate(() => window.reloadReorderFixture())
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="habit-row"]').length === 6)
    expect(await rows.evaluateAll((elements) => elements.map((row) => row.getAttribute('data-habit-title')))).toEqual(expected)
    expect(errors).toEqual([])
  } finally { await page.close() }
})
