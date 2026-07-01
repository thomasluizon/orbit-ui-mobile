import { describe, expect, it, vi } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { PricingFooter } from '@/components/upgrade/pricing-footer'
import type { SubscriptionInterval, UpgradeTextFn } from '@/components/upgrade/types'

const TestRenderer = require('react-test-renderer')

const t: UpgradeTextFn = (key) => key
const tokens = createTokensV2('purple', 'dark')

function renderFooter(props: Partial<React.ComponentProps<typeof PricingFooter>> = {}) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PricingFooter
        trialActive={false}
        selectedInterval={'yearly' as SubscriptionInterval}
        priceEcho="Pro Yearly · $49.99/yr"
        checkoutLoading={null}
        checkoutError=""
        disabled={false}
        onCheckout={() => {}}
        t={t}
        tokens={tokens}
        {...props}
      />,
    )
  })
  return tree
}

function texts(tree: any): unknown[] {
  return tree.root.findAllByType('Text').map((node: any) => node.props.children)
}

describe('PricingFooter (mobile)', () => {
  it('shows the trial-keeping CTA when the trial is still active', () => {
    const tree = renderFooter({ trialActive: true })
    expect(texts(tree)).toContain('upgrade.convert.trialCta')
  })

  it('shows the upgrade CTA and echoes the plan and terms for free users', () => {
    const tree = renderFooter({ trialActive: false })
    const rendered = texts(tree)
    expect(rendered).toContain('upgrade.convert.freeCta')
    expect(rendered).toContain('Pro Yearly · $49.99/yr')
    expect(rendered).toContain('upgrade.convert.cancelAnytime')
  })

  it('checks out the selected interval', () => {
    const onCheckout = vi.fn()
    const tree = renderFooter({ onCheckout, selectedInterval: 'monthly' })
    const button = tree.root.findByType('Pressable')
    TestRenderer.act(() => {
      button.props.onPress()
    })
    expect(onCheckout).toHaveBeenCalledWith('monthly')
  })
})
