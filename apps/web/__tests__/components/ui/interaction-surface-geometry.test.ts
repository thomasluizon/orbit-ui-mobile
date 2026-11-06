import { afterAll, beforeAll, expect, it } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { inspectInteractionSurface } from '@/__tests__/support/interaction-surface-geometry'

declare global {
  interface Window {
    readSurfaceStyleCounts: () => number[]
  }
}

let browser: Browser
let launch: BrowserLaunch | undefined
registerChromeLaunchHook(beforeAll, async pending => { launch = pending; browser = await pending })
afterAll(async () => { await closeChrome(launch) }, 30_000)

it('reads each normal style once per measurement while detecting a nearby painted neighbour', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } })
  try {
    await page.setContent(`<style>
      body { margin: 0 }
      #frame { position: relative; width: 300px; height: 200px }
      button { position: absolute; left: 20px; top: 20px; width: 80px; height: 48px; border: 0; background: black }
      #neighbour { position: absolute; left: 102px; top: 20px; width: 20px; height: 48px; background: black }
    </style><div id="frame"><div><div><button>Action</button><span id="neighbour" aria-label="Neighbour"></span></div></div></div>`)
    await page.evaluate(() => {
      const counts = new Map<Element, number>()
      const original = window.getComputedStyle.bind(window)
      window.getComputedStyle = (element, pseudo) => {
        if (!pseudo) counts.set(element, (counts.get(element) ?? 0) + 1)
        return original(element, pseudo)
      }
      window.readSurfaceStyleCounts = () => [...counts.values()]
    })
    const control = page.getByRole('button', { name: 'Action' })
    const geometry = await control.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)
    expect(geometry.hasFill).toBe(true)
    expect(geometry.violations).toContainEqual({ neighbour: 'span#neighbour[Neighbour]', distance: 2 })
    expect(await page.evaluate(() => Math.max(...window.readSurfaceStyleCounts()))).toBe(1)

    await control.evaluate(element => { element.style.left = '150px' })
    const moved = await control.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)
    expect(moved.hasFill).toBe(true)
    expect(moved.violations).toEqual([])
    await control.evaluate(element => { element.style.background = 'transparent' })
    expect((await control.evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)).hasFill).toBe(false)
  } finally {
    await page.close()
  }
})

it.each([
  { shadow: '0 12px 40px black', fails: false },
  { shadow: '0 0 0 8px black', fails: true },
])('measures a $shadow neighbour shadow as fill paint only when it spreads', async ({ shadow, fails }) => {
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } })
  try {
    await page.setContent(`<style>
      body { margin: 0 }
      button { position: absolute; left: 20px; top: 20px; width: 80px; height: 48px; border: 0; background: black }
      #neighbour { position: absolute; left: 112px; top: 20px; width: 48px; height: 48px; background: black; box-shadow: ${shadow} }
    </style><button>Action</button><span id="neighbour" aria-label="Neighbour"></span>`)
    const geometry = await page.getByRole('button', { name: 'Action' }).evaluate(inspectInteractionSurface, INTERACTION_FILL_CLEARANCE)
    expect(geometry.violations.some(violation => violation.neighbour === 'span#neighbour[Neighbour]')).toBe(fails)
  } finally {
    await page.close()
  }
})
