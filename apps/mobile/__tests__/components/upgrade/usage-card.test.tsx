import React from 'react'
import { describe, expect, it } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { UsageCard } from '@/components/upgrade/usage-card'
import type { UpgradeTextFn } from '@/components/upgrade/types'

const TestRenderer = require('react-test-renderer')

const t: UpgradeTextFn = (key, params) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const tokens = createTokensV2('purple', 'dark')

type RenderedTree = {
  root: {
    findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => unknown[]
  }
  toJSON: () => unknown
}

function renderUsageCard(
  usageUrgent: boolean,
  profile: { aiMessagesUsed: number; aiMessagesLimit: number } | null,
) {
  let tree: RenderedTree | undefined
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <UsageCard
        usagePercent={usageUrgent ? 82 : 16}
        usageUrgent={usageUrgent}
        profile={profile}
        t={t}
        tokens={tokens}
      />,
    )
  })
  return tree!
}

function hasText(tree: RenderedTree, text: string) {
  return tree.root.findAll((node) => node.props.children === text).length > 0
}

describe('UsageCard', () => {
  it('shows the current usage without a capacity warning below the threshold', () => {
    const tree = renderUsageCard(false, { aiMessagesUsed: 8, aiMessagesLimit: 50 })
    expect(hasText(tree, 'upgrade.billing.usage.aiMessagesOf:{\"used\":8,\"limit\":50}')).toBe(true)
    expect(hasText(tree, 'upgrade.billing.usage.nearLimit')).toBe(false)
  })

  it('shows the capacity warning at the urgent threshold', () => {
    const tree = renderUsageCard(true, { aiMessagesUsed: 41, aiMessagesLimit: 50 })
    expect(hasText(tree, 'upgrade.billing.usage.nearLimit')).toBe(true)
    expect(hasText(tree, 'upgrade.billing.usage.nearLimitBody')).toBe(true)
  })

  it('renders zero usage when cached profile content is unavailable', () => {
    expect(
      hasText(renderUsageCard(false, null), 'upgrade.billing.usage.aiMessagesOf:{\"used\":0,\"limit\":0}'),
    ).toBe(true)
  })
})
