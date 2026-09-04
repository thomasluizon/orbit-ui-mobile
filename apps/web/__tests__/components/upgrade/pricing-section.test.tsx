import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { chromium } from 'playwright'
import { compile } from 'tailwindcss'
import { describe, expect, it, vi } from 'vitest'
import type { useTranslations } from 'next-intl'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { PricingSection } from '@/components/upgrade/pricing-section'

const t = ((key: string) => key) as unknown as ReturnType<typeof useTranslations>
const plans: SubscriptionPlans = {
  monthly: { unitAmount: 1290, currency: 'brl' },
  yearly: { unitAmount: 9990, currency: 'brl' },
  savingsPercent: 35,
  couponPercentOff: 23,
  currency: 'brl',
}
const geistFont = readFileSync(
  resolve(process.cwd(), '../../design/brand/fonts/Geist[wght].ttf'),
).toString('base64')
const geistMonoFont = readFileSync(
  resolve(process.cwd(), '../../design/brand/fonts/GeistMono[wght].ttf'),
).toString('base64')

function translator(messages: typeof en): ReturnType<typeof useTranslations> {
  return ((key: string, values?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>(
      (current, part) => (current as Record<string, unknown>)[part],
      messages,
    )
    return Object.entries(values ?? {}).reduce(
      (translated, [name, replacement]) =>
        translated.replaceAll(`{${name}}`, String(replacement)),
      String(value),
    )
  }) as unknown as ReturnType<typeof useTranslations>
}

function renderPricingSection(
  translate: ReturnType<typeof useTranslations> = t,
  profile: { isTrialActive?: boolean } | null = null,
) {
  return render(
    <PricingSection
      profile={profile}
      plans={translate === t ? null : plans}
      isLoadingPlans={false}
      isPlansError={false}
      isOnline
      trialDaysLeft={profile?.isTrialActive ? 5 : null}
      checkoutLoading={null}
      checkoutError=""
      discountedAmount={(amount) => amount}
      onCheckout={vi.fn()}
      onStayFree={vi.fn()}
      onRetryPlans={vi.fn()}
      t={translate}
    />,
  )
}

function classCandidates() {
  return Array.from(document.querySelectorAll('[class]')).flatMap(
    (element) => element.getAttribute('class')?.split(/\s+/).filter(Boolean) ?? [],
  )
}

async function buildTailwindCss() {
  const tailwind = await compile('@theme { --breakpoint-sm: 40rem; } @tailwind utilities;')
  return tailwind.build(classCandidates())
}

function fixtureHtml(css: string, contentWidth: number) {
  return `<style>
    @font-face { font-family: GeistFixture; src: url(data:font/ttf;base64,${geistFont}) format('truetype'); }
    @font-face { font-family: GeistMonoFixture; src: url(data:font/ttf;base64,${geistMonoFont}) format('truetype'); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: GeistFixture, sans-serif; }
    .t-eyebrow { font-family: GeistFixture, sans-serif; font-size: 12px; line-height: 16.8px; }
    .t-display { font-size: 34px; line-height: 39.1px; }
    .t-secondary { font-size: 14px; line-height: 21.7px; }
    .t-meta { font-family: GeistMonoFixture, monospace; font-size: 12px; line-height: 18.6px; }
    ${css}
    .font-mono { font-family: GeistMonoFixture, monospace; }
    .text-sm { font-size: 14px; }
    .text-base { font-size: 16px; }
  </style><main style="width:${contentWidth}px">${document.body.innerHTML}</main>`
}

async function captureLayouts(css: string) {
  const browser = await chromium.launch({ headless: true })
  try {
    return await Promise.all([412, 640].map(async (width) => {
      const page = await browser.newPage({ viewport: { width, height: 1400 } })
      await page.setContent(fixtureHtml(css, Math.min(width - 32, 588)))
      await page.evaluate(() => document.fonts.ready)
      const copy = await page.locator('main').evaluate((root) =>
        Array.from(root.querySelectorAll('p,h1,h2,a,button,span'))
          .filter((element) => element.textContent.trim())
          .map((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            const bounds = element.getBoundingClientRect()
            const lineTops = new Set(
              Array.from(range.getClientRects()).map((rect) => Math.round(rect.top * 10) / 10),
            )
            return {
              text: element.textContent.trim(),
              lines: lineTops.size,
              overflows: element.scrollWidth > bounds.width + 0.5,
            }
          }),
      )
      await page.close()
      return { width, copy }
    }))
  } finally {
    await browser.close()
  }
}

describe('PricingSection', () => {
  it('renders the allowance figure at 34px narrow and 44px wide', async () => {
    renderPricingSection()
    const allowance = screen.getByText('upgrade.convert.freeAllowance')
    allowance.setAttribute('data-allowance-test', '')
    const css = await buildTailwindCss()
    const browser = await chromium.launch({ headless: true })

    try {
      const sizes = await Promise.all([412, 640].map(async (width) => {
        const page = await browser.newPage({ viewport: { width, height: 800 } })
        await page.setContent(`<style>${css}</style>${document.body.innerHTML}`)
        const fontSize = await page.locator('[data-allowance-test]').evaluate(
          (element) => getComputedStyle(element).fontSize,
        )
        await page.close()
        return fontSize
      }))

      expect(sizes).toEqual(['34px', '44px'])
    } finally {
      await browser.close()
    }
  })

  it.each([
    ['en', en],
    ['pt-BR', ptBr],
  ] as const)(
    'keeps %s upgrade labels on one line and all copy inside the layout',
    async (_locale, messages) => {
      renderPricingSection(translator(messages))
      renderPricingSection(translator(messages), { isTrialActive: true })
      const layouts = await captureLayouts(await buildTailwindCss())
      const singleLineLabels = [
        messages.upgrade.convert.freeEyebrow,
        messages.upgrade.convert.freeHeading,
        messages.upgrade.convert.promise,
        messages.upgrade.convert.trustLine,
        messages.upgrade.free,
        'Pro',
        messages.upgrade.convert.freeAllowance,
        messages.upgrade.convert.proAllowance,
        messages.upgrade.convert.perDay,
        ...Object.values(messages.upgrade.outcomes).flatMap((outcome) =>
          typeof outcome === 'string' ? [] : [outcome.title]),
        messages.upgrade.plans.interval.monthly,
        messages.upgrade.plans.interval.annual,
        messages.upgrade.plans.monthly.name,
        messages.upgrade.plans.yearly.name,
        messages.upgrade.plans.recommended,
        messages.upgrade.plans.cta,
        messages.upgrade.convert.cancelAnytime,
        messages.upgrade.convert.stayFree,
      ]

      for (const layout of layouts) {
        expect(layout.copy.filter(({ overflows }) => overflows)).toEqual([])
        for (const label of singleLineLabels) {
          const matches = layout.copy.filter(({ text }) => text === label)
          expect(matches.length, `${label} is present at ${layout.width}px`).toBeGreaterThan(0)
          expect(
            matches.some(({ lines }) => lines === 1),
            `${label} stays on one line at ${layout.width}px`,
          ).toBe(true)
        }
      }
    },
  )
})
