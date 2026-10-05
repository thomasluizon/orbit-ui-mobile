import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { PillButton } from '@/components/ui/pill-button'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { expectHoverOnHitArea } from '@/e2e/layout/press-shape-helpers'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

describe('press shape hover sampling in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function renderPill(styles = '') {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    await page.bringToFront()
    const variables = Object.entries(resolveWebThemeVariables('orange', 'dark'))
      .map(([name, value]) => `${name}: ${value};`).join(' ')
    const markup = renderToStaticMarkup(<PillButton variant="ghost">Cancel</PillButton>)
    await page.setContent(`<!doctype html><style>${stylesheet}
      :root { ${variables} }
      body { padding: 80px; }
      ${styles}
    </style>${markup}`)
    return page
  }

  it('waits for the previous hover fill to leave before reading the resting state', async () => {
    const page = await renderPill(`
      button { transition: background-color 600ms steps(1, end); }
      button:hover { transition: none; }
    `)
    try {
      const control = page.getByRole('button', { name: 'Cancel' })
      await control.hover()
      await expectHoverOnHitArea(control, 'pill', '--bg-hover')
    } finally {
      await page.close()
    }
  })

  it('waits for a separate fill layer to lose its previous hover opacity', async () => {
    const page = await renderPill(`
      [data-press-fill] { position: absolute; inset: 0; border-radius: inherit;
        pointer-events: none; background: var(--bg-hover-opaque); opacity: 0;
        transition: opacity 600ms steps(1, end); }
      button:hover [data-press-fill] { opacity: 1; transition: none; }
    `)
    try {
      const control = page.getByRole('button', { name: 'Cancel' })
      await control.evaluate((element) => {
        const fill = document.createElement('span')
        fill.setAttribute('data-press-fill', '')
        fill.setAttribute('aria-hidden', 'true')
        element.append(fill)
      })
      await control.hover()
      await expectHoverOnHitArea(control, 'pill', '--bg-hover-opaque')
    } finally {
      await page.close()
    }
  })

  it('waits for an exiting overlay to uncover the hover point', async () => {
    const page = await renderPill(`
      [data-overlay] { position: fixed; inset: 0; z-index: 1;
        animation: uncover 800ms steps(1, end) forwards; }
      @keyframes uncover { to { transform: translateX(100%); } }
    `)
    try {
      await page.evaluate(() => {
        const overlay = document.createElement('div')
        overlay.setAttribute('data-overlay', '')
        document.body.append(overlay)
      })
      const control = page.getByRole('button', { name: 'Cancel' })
      expect(await control.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))
      })).toBe(false)
      await expectHoverOnHitArea(control, 'pill', '--bg-hover')
    } finally {
      await page.close()
    }
  })

  it('waits for the owning surface entrance even when the hit box is already still', async () => {
    const page = await renderPill(`
      @keyframes enter { from { opacity: 0.1; } to { opacity: 1; } }
    `)
    try {
      const control = page.getByRole('button', { name: 'Cancel' })
      await control.evaluate((element) => {
        const surface = document.createElement('section')
        surface.style.animation = 'enter 800ms steps(1, end)'
        element.before(surface)
        surface.append(element)
      })
      await expectHoverOnHitArea(control, 'pill', '--bg-hover')
      expect(await control.evaluate((element) => getComputedStyle(element.parentElement!).opacity)).toBe('1')
    } finally {
      await page.close()
    }
  })

  it('settles reduced motion transitions without waiting on an infinite loading animation', async () => {
    const page = await renderPill(`
      [data-loading] { animation: loading 1s linear infinite; }
      @keyframes loading { to { transform: rotate(360deg); } }
    `)
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate(() => {
        const loading = document.createElement('span')
        loading.setAttribute('data-loading', '')
        loading.setAttribute('aria-hidden', 'true')
        loading.className = 'orbit-essential-loading'
        document.querySelector('button')!.append(loading)
      })
      expect(await page.locator('[data-loading]').evaluate((element) =>
        element.getAnimations()[0]!.effect!.getComputedTiming().endTime)).toBe(Infinity)
      const control = page.getByRole('button', { name: 'Cancel' })
      await control.hover()
      await expectHoverOnHitArea(control, 'pill', '--bg-hover')
    } finally {
      await page.close()
    }
  })

  it('rejects a pill whose hover fill has been removed', async () => {
    const page = await renderPill('button:hover { background: transparent !important; }')
    try {
      await expect(expectHoverOnHitArea(page.getByRole('button', { name: 'Cancel' }), 'pill'))
        .rejects.toThrow('the painted hit area responds to hover')
    } finally {
      await page.close()
    }
  })
})
