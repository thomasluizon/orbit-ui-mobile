import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { inspectControls } from '@/e2e/layout/interaction-fill-states'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('interaction clearance inspector in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(['top: -80px', 'top: 0; transform: translateY(-200%)'])('measures only reachable focus paint for an off-canvas control (%s)', async (position) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    page.setDefaultTimeout(250)
    try {
      await page.setContent(`<style>
        a { position: fixed; left: 32px; padding: 8px; ${position} }
        a:focus-visible { top: 16px; transform: none; background: gray; outline: none }
      </style><a href="#content">Keyboard entry</a><main id="content" style="margin-top: 160px">Content</main>`)
      await page.evaluate(() => {
        for (const event of ['pointerenter', 'pointerdown', 'focus']) document.querySelector('a')!.addEventListener(event, () => {
          document.body.dataset[event] = String(Number(document.body.dataset[event] ?? 0) + 1)
        })
      })
      await inspectControls(page, page.locator('a'), '/habits/habit-1, 320px, en', INTERACTION_FILL_CLEARANCE)
      expect(await page.locator('body').getAttribute('data-pointerenter')).toBeNull()
      expect(await page.locator('body').getAttribute('data-pointerdown')).toBeNull()
      expect(Number(await page.locator('body').getAttribute('data-focus'))).toBeGreaterThan(0)
    } finally { await page.close() }
  })

  it('reports a blocked pointer action with the route, width, locale and control', async () => {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    page.setDefaultTimeout(120_000)
    try {
      await page.setContent('<button>Blocked control</button><div style="position: fixed; inset: 0; background: white"></div>')
      await expect(inspectControls(page, page.locator('button'), '/settings, 412px, pt-BR', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/\/settings, 412px, pt-BR.*button\[Blocked control\].*hover/)
    } finally { await page.close() }
  }, 5000)

  it('reports a control that remains off-canvas after focus', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    page.setDefaultTimeout(250)
    try {
      await page.setContent('<a href="#content" style="position: fixed; top: -80px">Hidden entry</a>')
      await expect(inspectControls(page, page.locator('a'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/\/settings, 320px, en.*a\[Hidden entry\].*focus-visible.*outside the viewport/)
    } finally { await page.close() }
  })

  it('scrolls an ordinary control into view and measures hover, held press and keyboard focus without activation', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        button { margin-top: 1200px; padding: 8px; border: 0; background: transparent; outline: none }
        button:hover, button:active, button:focus-visible { background: gray }
      </style><button>Scrollable control</button>`)
      await page.evaluate(() => {
        const button = document.querySelector('button')!
        for (const event of ['pointerenter', 'pointerdown', 'pointerup', 'focus', 'click']) button.addEventListener(event, () => {
          document.body.dataset[event] = String(Number(document.body.dataset[event] ?? 0) + 1)
        })
      })
      await inspectControls(page, page.locator('button'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE)
      for (const event of ['pointerenter', 'pointerdown', 'focus']) {
        expect(Number(await page.locator('body').getAttribute(`data-${event}`))).toBeGreaterThan(0)
      }
      expect(await page.locator('body').getAttribute('data-pointerup')).toBeNull()
      expect(await page.locator('body').getAttribute('data-click')).toBeNull()
    } finally { await page.close() }
  })

  it('measures the revealed focus fill against neighbours', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        a { position: fixed; left: 32px; top: -80px; width: 160px; height: 48px }
        a:focus-visible { top: 16px; background: gray; outline: none }
        p { position: fixed; left: 32px; top: 64px; margin: 0 }
      </style><a href="#content">Keyboard entry</a><p>Focus neighbour</p>`)
      await expect(inspectControls(page, page.locator('a'), '/settings, 320px, en', INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(/\/settings, 320px, en.*a\[Keyboard entry\].*focus-visible[\s\S]*p\[Focus neighbour\]/)
    } finally { await page.close() }
  })

  it.each([
    { width: 320, locale: 'en' }, { width: 412, locale: 'en' },
    { width: 320, locale: 'pt-BR' }, { width: 412, locale: 'pt-BR' },
  ])('reports the habit title against its frequency summary before earlier controls at $width in $locale', async ({ width, locale }) => {
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px } a { position: fixed; top: -100px }
        button { position: relative; display: block; width: 160px; height: 48px; padding: 0; border: 0; outline: none; background: transparent }
        .emoji { width: 76px; height: 76px; margin-bottom: 12px; background: gray }
        .orbit-habit-rename::before { content: ''; position: absolute; inset: -8px -16px; opacity: 0; background: gray }
        .orbit-habit-rename:hover::before { opacity: 1 }
        p { margin: 4px 0 0 }
      </style><a href="#content">Keyboard entry</a><button class="emoji" aria-label="Emoji well">📖</button>
      <button class="orbit-habit-rename">Habit title</button><p>Frequency summary</p>`)
      await expect(inspectControls(page, page.locator('a, button'), `/habits/habit-1, ${width}px, ${locale}`, INTERACTION_FILL_CLEARANCE))
        .rejects.toThrow(new RegExp(`/habits/habit-1, ${width}px, ${locale}.*button\\.orbit-habit-rename\\[Habit title\\].*hover[\\s\\S]*p\\[Frequency summary\\]`))
    } finally { await page.close() }
  })

  it.each([
    { paint: 'background: gray', gap: 4, extension: 8, fails: true },
    { paint: 'background: gray', gap: 12, extension: 8, fails: false },
    { paint: 'background: transparent', gap: 4, extension: 8, fails: false },
    { paint: 'background: gray; opacity: 0', gap: 4, extension: 8, fails: false },
    { paint: 'background: gray; box-shadow: 0 0 0 100px transparent', gap: 12, extension: 8, fails: false },
    { paint: 'background: gray; outline: 2px solid black; outline-offset: 2px', gap: 12, extension: 8, fails: true },
  ])('measures $paint with a $gap gap and $extension extension', async ({ paint, gap, extension, fails }) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px; display: flex; flex-direction: column; gap: ${gap}px }
        button { position: relative; height: 48px; width: 160px; background: transparent; border: 0; outline: none }
        button::before { content: ''; position: absolute; inset: -${extension}px; ${paint} }
        p { margin: 0; height: 16px }
      </style><button aria-label="Rename">Title</button><p>Frequency</p>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour === 'p[Frequency]')).toBe(fails)
    } finally { await page.close() }
  })

  it('measures both painted pseudos while ignoring the control contents and structural wrappers', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px } button { position: relative; width: 160px; height: 48px; border: 0; outline: none }
        button::before { content: ''; position: absolute; inset: -4px; background: gray }
        button::after { content: ''; position: absolute; inset: -8px; border: 2px solid black }
      </style><section><div><button aria-label="Rename"><span>Title</span></button></div></section>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.fill).toEqual({ left: 24, top: 24, right: 200, bottom: 88 })
      expect(result.violations).toEqual([])
    } finally { await page.close() }
  })

  it('rejects a fill approaching a painted static neighbour with no text', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px; display: flex; flex-direction: column; gap: 4px }
        button { position: relative; width: 160px; height: 48px; outline: none; border: 0 }
        button::after { content: ''; position: absolute; inset: -8px; background: gray }
        aside { height: 16px; background: black }
      </style><button>Rename</button><aside></aside>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations).toContainEqual({ neighbour: 'aside[]', distance: 0 })
    } finally { await page.close() }
  })

  it('ignores transparent full-column tab targets on both sides of the measurement', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 0 } nav { display: flex } button { width: 80px; height: 80px; padding: 0; border: 0; outline: none; background: transparent }
        span { display: inline-flex; padding: 8px; background: gray }
      </style><nav><button><span>One</span></button><button>Two</button><button><span>Three</span></button><button>Four</button></nav>`)
      const result = await page.getByRole('button').first().evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.fill.left).toBeGreaterThan(0)
      expect(result.fill.right).toBeLessThan(80)
      expect(result.violations).toEqual([])
    } finally { await page.close() }
  })

  it.each([false, true])('permits contained grid cell paint but rejects an extension (outside=%s)', async (outside) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px; display: flex } button { width: 80px; height: 80px; position: relative; border: 0; outline: none; background: gray }
        button::before { content: ''; position: absolute; inset: ${outside ? '-4px' : '0'}; background: gray }
      </style><button data-interaction-fill-cell>Monday</button><button>Tuesday</button>`)
      const result = await page.getByRole('button').first().evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.violations.some((violation) => violation.neighbour === 'button[Tuesday]')).toBe(outside)
    } finally { await page.close() }
  })

  it.each([-4, 0, 4])('measures paint against its grid column without a neighbour (offset=%s)', async (offset) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>
        body { margin: 32px } [data-interaction-fill-grid] { display: grid; grid-template-columns: repeat(7, 1fr) }
        button { width: 100%; height: 44px; padding: 0; border: 0; background: transparent; outline: none }
        span { display: block; height: 40px; background: gray; transform: translateX(${offset}px) }
      </style><div data-interaction-fill-grid><div><button aria-label="Day"><span></span></button></div></div>`)
      const result = await page.getByRole('button').evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
      expect(result.hasFill).toBe(true)
      expect(result.violations.some((violation) => violation.neighbour === 'grid cell edge')).toBe(offset !== 0)
    } finally { await page.close() }
  })

})
