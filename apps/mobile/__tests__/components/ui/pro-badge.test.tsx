import type { ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ProBadge } from '@/components/ui/pro-badge'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: undefined }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

interface TestNode {
  readonly props: Readonly<Record<string, unknown>>
  findAllByType(type: unknown): TestNode[]
}

function render(element: ReactElement): TestNode {
  let tree!: { root: TestNode }
  void act(() => {
    tree = create(element) as unknown as { root: TestNode }
  })
  return tree.root
}

describe('ProBadge on mobile', () => {
  it('applies caller spacing to the badge wrapper', () => {
    const root = render(
      <ProBadge alwaysVisible label="Pro" style={{ marginLeft: 4 }} />,
    )

    const spacedWrapper = root.findAllByType(View).find((node) =>
      StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>).marginLeft === 4,
    )

    expect(spacedWrapper).toBeDefined()
  })
})
