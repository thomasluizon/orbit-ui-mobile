import { render, screen } from '@testing-library/react'
import { chromium } from 'playwright'
import { compile } from 'tailwindcss'
import { describe, expect, it, vi } from 'vitest'
import type { useTranslations } from 'next-intl'
import { PricingSection } from '@/components/upgrade/pricing-section'

const t = ((key: string) => key) as unknown as ReturnType<typeof useTranslations>

function renderPricingSection() {
  render(
    <PricingSection
      profile={null}
      plans={null}
      isLoadingPlans={false}
      isPlansError={false}
      isOnline
      trialDaysLeft={null}
      checkoutLoading={null}
      checkoutError=""
      discountedAmount={(amount) => amount}
      onCheckout={vi.fn()}
      onStayFree={vi.fn()}
      onRetryPlans={vi.fn()}
      t={t}
    />,
  )
}

describe('PricingSection', () => {
  it('renders the allowance figure at 34px narrow and 44px wide', async () => {
    renderPricingSection()
    const allowance = screen.getByText('upgrade.convert.freeAllowance')
    allowance.setAttribute('data-allowance-test', '')
    const candidates = Array.from(document.querySelectorAll('[class]')).flatMap(
      (element) => element.getAttribute('class')?.split(/\s+/).filter(Boolean) ?? [],
    )
    const tailwind = await compile(
      '@theme { --breakpoint-sm: 40rem; } @tailwind utilities;',
    )
    const css = tailwind.build(candidates)
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
})
