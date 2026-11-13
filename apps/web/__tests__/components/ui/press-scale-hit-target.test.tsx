import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const schedule = { frequencyUnit: 'Week' as const, frequencyQuantity: 3, intervalWeeks: 2, days: [], isGeneral: false, isFlexible: true, dueTime: '' }

function proposalMarkup() {
  const { container, unmount } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <OnboardingCreateHabit title="Walk outside" emoji="🚶" schedule={schedule} proposed correcting={false} canSaveRepeatWeeks atLimit={false} allowance={5}
      onCorrect={vi.fn()} onToggleDay={vi.fn()} onTimeChange={vi.fn()} onModeChange={vi.fn()} onFrequencyUnitChange={vi.fn()} onQuantityChange={vi.fn()} onIntervalWeeksChange={vi.fn()} />
  </NextIntlClientProvider>)
  const markup = container.innerHTML
  unmount()
  return markup
}

describe('card press hit target in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('keeps the click of a press that starts at the edge of the onboarding proposal card', async () => {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'no-preference' })
    try {
      await page.setContent(`<style>${stylesheet} body{padding:16px} *,*::before,*::after{transition:none !important}</style><main>${proposalMarkup()}</main>`)
      const card = page.getByRole('button', { name: 'Correct schedule. Emoji proposed by Astra', exact: true })
      await card.evaluate((element) => { element.addEventListener('click', () => { element.dataset.clicks = String(Number(element.dataset.clicks ?? 0) + 1) }) })
      const box = (await card.boundingBox())!
      const edge = { x: box.x + 2, y: box.y + box.height / 2 }
      expect(await card.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), edge), 'the press starts on the card').toBe(true)
      await page.mouse.move(edge.x, edge.y)
      await page.mouse.down()
      await page.evaluate(() => new Promise<void>((settle) => requestAnimationFrame(() => requestAnimationFrame(() => settle()))))
      const pressed = await card.evaluate((element, point) => ({
        scaled: [element, ...element.querySelectorAll('*')].some((node) => getComputedStyle(node).scale === '0.96'),
        underPointer: element.contains(document.elementFromPoint(point.x, point.y)),
      }), edge)
      await page.mouse.up()
      expect(pressed.scaled, 'the press scales the card').toBe(true)
      expect(pressed.underPointer, 'the press target stays under the pointer while the card is scaled').toBe(true)
      expect(await card.getAttribute('data-clicks'), 'the press keeps its click').toBe('1')
    } finally { await page.close() }
  })
})
