import type { ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { renderedText } from '@/__tests__/support/react-test-renderer'
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
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  findAllByType(type: unknown): TestNode[]
  findAll(match: (node: TestNode) => boolean): TestNode[]
}

function render(element: ReactElement): TestNode {
  let tree!: { root: TestNode }
  void act(() => {
    tree = create(element)
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

  it('keeps its text and draws no mascot with the guided flows on', () => {
    enableTestFlags('orbit_guided_flows')
    const root = render(<ProBadge alwaysVisible label="Pro" />)
    const hosts = root.findAll((node) => typeof node.type === 'string')
    expect(hosts.filter((node) => node.type === 'Text').map((node) => renderedText(node as never))).toEqual(['Pro'])
    expect(hosts.some((node) => node.props['data-orbit-face'] !== undefined || node.props['data-orbit-state'] !== undefined)).toBe(false)
  })
})
