import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('interaction clearance inspector in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([
    { paint: 'background: gray', gap: 4, extension: 8, fails: true },
    { paint: 'background: gray', gap: 12, extension: 8, fails: false },
    { paint: 'background: transparent', gap: 4, extension: 8, fails: false },
    { paint: 'background: gray; opacity: 0', gap: 4, extension: 8, fails: false },
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
})
