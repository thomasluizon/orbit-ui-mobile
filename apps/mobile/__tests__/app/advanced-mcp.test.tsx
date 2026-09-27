import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tokens } from '@/app/advanced-styles'

const clipboard = vi.hoisted(() => ({ setString: vi.fn() }))

vi.mock('@react-native-clipboard/clipboard', () => ({ default: clipboard }))
vi.mock('lucide-react-native', () => {
  const Icon = () => React.createElement('Icon')
  return {
    Check: Icon,
    CheckCircle: Icon,
    ChevronDown: Icon,
    Clipboard: Icon,
    Clock: Icon,
    List: Icon,
    Plus: Icon,
    RotateCcw: Icon,
  }
})
vi.mock('@/components/ui/chip', () => ({
  Chip: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) =>
    React.createElement('Pressable', { onPress }, children),
}))

interface TestNode {
  props: {
    accessibilityState?: { expanded?: boolean }
    onPress?: () => void
    children?: React.ReactNode
    [key: string]: unknown
  }
  find(predicate: (node: TestNode) => boolean): TestNode
  findByProps(props: Record<string, unknown>): TestNode
}

interface TestTree {
  root: TestNode
  toJSON(): unknown
}

const TestRenderer: {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
} = require('react-test-renderer')

describe('MCP connection instructions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    clipboard.setString.mockClear()
  })

  it('requires an explicit API base in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('EXPO_PUBLIC_API_BASE', undefined)
    vi.resetModules()

    await expect(import('@/lib/api-base')).rejects.toThrow('EXPO_PUBLIC_API_BASE')
  })

  it('shows and copies the selected API endpoint in both tabs', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE', 'https://api-staging.useorbit.org/')
    vi.resetModules()
    const { McpConnectionInstructions } = await import('@/app/advanced-sections')
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <McpConnectionInstructions t={(key) => key} tokens={{} as Tokens} />,
      )
    })

    const press = (node: TestNode) => {
      TestRenderer.act(() => {
        node.props.onPress?.()
      })
    }
    press(tree.root.find((node) => node.props.accessibilityState?.expanded === false))
    expect(JSON.stringify(tree.toJSON())).toContain('https://api-staging.useorbit.org/mcp')
    press(tree.root.findByProps({ accessibilityLabel: 'orbitMcp.copy' }))
    expect(clipboard.setString).toHaveBeenCalledWith('https://api-staging.useorbit.org/mcp')

    press(tree.root.find((node) => node.props.children === 'orbitMcp.claudeCode' && !!node.props.onPress))
    expect(JSON.stringify(tree.toJSON())).toContain('https://api-staging.useorbit.org/mcp')
    press(tree.root.findByProps({ accessibilityLabel: 'orbitMcp.copy' }))
    expect(JSON.parse(clipboard.setString.mock.lastCall![0]).mcpServers.orbit.url).toBe(
      'https://api-staging.useorbit.org/mcp',
    )
  })
})
