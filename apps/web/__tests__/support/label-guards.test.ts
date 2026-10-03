import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectFillShape } from '@/e2e/layout/label-interaction-fill'
import { expectLabelsFit } from '@/e2e/layout/label-fit-contract'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

describe('label and interaction fill guards in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([
    { name: 'centered partial fill', inset: '12px', passes: false },
    { name: 'full control fill', inset: '0', passes: true },
    { name: 'fill inset within tolerance', inset: '1px', passes: true },
    { name: 'fill outside within tolerance', inset: '-1px', passes: true },
    { name: 'left edge inset beyond tolerance', inset: '0 0 0 2px', passes: false },
    { name: 'right edge inset beyond tolerance', inset: '0 2px 0 0', passes: false },
    { name: 'top edge inset beyond tolerance', inset: '2px 0 0 0', passes: false },
    { name: 'bottom edge inset beyond tolerance', inset: '0 0 2px 0', passes: false },
    { name: 'fill extending beyond the control', inset: '-2px', passes: false },
  ])('checks the $name against every control edge', async ({ inset, passes }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { position: relative; width: 64px; height: 64px; padding: 0; border: 0; border-radius: 8px; }
        [data-press-fill] { position: absolute; inset: ${inset}; display: grid; place-items: center;
          border-radius: 8px; background: rgb(220, 220, 220); }
        svg { width: 16px; height: 16px; }
      </style><button><span data-press-fill><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /></svg></span></button>`)
      const assertion = expectFillShape(page.locator('button'), 'hover')
      if (passes) await assertion
      else await expect(assertion).rejects.toThrow(/fill.*control/)
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'stacked spans', display: 'block', attributes: '', passes: false },
    { name: 'inline spans', display: 'inline', attributes: '', passes: true },
    { name: 'stacked state spans', display: 'block', attributes: 'data-state="open"', passes: false },
    { name: 'inline state spans', display: 'inline', attributes: 'data-state="open"', passes: true },
  ])('checks a composed label with $name as one label', async ({ display, attributes, passes }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>button span { display: ${display}; }</style>
        <button ${attributes}><span>Completion</span> <span>rate</span></button>`)
      const assertion = expectLabelsFit(page)
      if (passes) await assertion
      else await expect(assertion).rejects.toThrow('app-authored labels must stay on one line')
    } finally {
      await page.close()
    }
  })

  it('rejects a full-size fill with an unpainted pseudo-element hit extension', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { position: relative; width: 64px; height: 64px; border: 0; border-radius: 8px;
          background: rgb(220, 220, 220); }
        button::before { content: ""; position: absolute; inset: -4px; }
      </style><button>Go</button>`)
      await expect(expectFillShape(page.locator('button'), 'press')).rejects.toThrow('a hit extension must also carry the fill')
    } finally {
      await page.close()
    }
  })

  it.each([
    { name: 'separate captions', content: '<span data-layout-label>Completion</span><span data-layout-label>rate</span>', passes: true },
    { name: 'separate title and description', content: '<h3>Completion</h3><span data-layout-label>rate</span>', passes: true },
    { name: 'separate stat value and caption', content: '<div data-state="default"><span>100%</span><span>Completion rate</span></div>', wrapper: 'div', passes: true },
    { name: 'excluded user text', content: '<span data-layout-text-origin="user">A long title<br>from a person</span><span data-layout-label>Edit</span>', passes: true },
    { name: 'app action beside excluded user text', content: '<span data-layout-text-origin="user">A long title<br>from a person</span><span data-layout-label>Edit<br>habit</span>', passes: false },
    { name: 'wrapped plain text', content: '<span data-layout-label style="width: 50px">Completion rate</span>', passes: false },
  ])('preserves the one-line contract for $name', async ({ content, wrapper = 'button', passes }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>span { display: block; } h3 { margin: 0; }</style><${wrapper}>${content}</${wrapper}>`)
      const assertion = expectLabelsFit(page)
      if (passes) await assertion
      else await expect(assertion).rejects.toThrow('app-authored labels must stay on one line')
    } finally {
      await page.close()
    }
  })

  it('rejects clipped composed labels even when they occupy one line', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>
        button { width: 60px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      </style><button><span>Completion</span> <span>rate</span></button>`)
      await expect(expectLabelsFit(page)).rejects.toThrow('app-authored labels must remain whole')
    } finally {
      await page.close()
    }
  })
})
