import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Skeleton } from '@/components/ui/skeleton'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => ({ bgWell: '#222222', bgCard: '#111111', hairline: '#333333' }),
  radius: { md: 12, xl: 20, full: 999 },
}))

vi.mock('@/lib/motion', () => ({
  usePrefersReducedMotion: () => true,
}))

describe('settings skeleton', () => {
  it('renders eight rows inside one accessible loading region', () => {
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Skeleton variant="settings" label="Loading profile" rows={8} />,
      )
    })

    expect(
      tree.root.findAll(
        (node: { type: unknown; props: { testID?: string } }) =>
          node.type === 'View' && node.props.testID === 'settings-skeleton-row',
      ),
    ).toHaveLength(8)
    expect(
      tree.root.findAll(
        (node: { type: unknown; props: { accessibilityRole?: string } }) =>
          node.type === 'View' && node.props.accessibilityRole === 'progressbar',
      ),
    ).toHaveLength(1)
  })
})
