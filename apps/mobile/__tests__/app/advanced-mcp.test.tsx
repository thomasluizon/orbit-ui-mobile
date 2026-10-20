import { captureException } from '@sentry/react-native'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tokens } from '@/app/advanced-styles'

const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn().mockResolvedValue(true) }))

vi.mock('expo-clipboard', () => clipboard)
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
  act(callback: () => void | Promise<void>): void | Promise<void>
} = require('react-test-renderer')

describe('MCP connection instructions', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    clipboard.setStringAsync.mockClear()
    vi.mocked(captureException).mockClear()
  })

  it('requires an explicit API base in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('EXPO_PUBLIC_API_BASE', undefined)
    vi.resetModules()

    await expect(import('@/lib/api-base')).rejects.toThrow('EXPO_PUBLIC_API_BASE')
  })

  it.each(['success', 'failure'])('writes the selected MCP text before confirming: %s', async (outcome) => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE', 'https://api-staging.useorbit.org/')
    vi.resetModules()
    const { McpConnectionInstructions } = await import('@/app/advanced-sections')
    let tree!: TestTree
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <McpConnectionInstructions t={(key) => key} tokens={{} as Tokens} />,
      )
    })

    const press = async (node: TestNode) => {
      await TestRenderer.act(() => {
        node.props.onPress?.()
      })
    }
    async function copySelected() {
      let finishWrite!: (value: boolean) => void
      let rejectWrite!: (reason: Error) => void
      const write = new Promise<boolean>((resolve, reject) => {
        finishWrite = resolve
        rejectWrite = reject
      })
      clipboard.setStringAsync.mockReturnValueOnce(write)
      await TestRenderer.act(() => {
        tree.root.findByProps({ accessibilityLabel: 'orbitMcp.copy' }).props.onPress?.()
      })
      expect(tree.root.findByProps({ accessibilityLabel: 'orbitMcp.copy' })).toBeDefined()
      await TestRenderer.act(async () => {
        if (outcome === 'success') {
          finishWrite(true)
          await write
        } else {
          const rejected = expect(write).rejects.toThrow('Clipboard unavailable')
          rejectWrite(new Error('Clipboard unavailable'))
          await rejected
        }
      })
      expect(captureException).toHaveBeenCalledTimes(outcome === 'failure' ? clipboard.setStringAsync.mock.calls.length : 0)
      expect(tree.root.findByProps({
        accessibilityLabel: outcome === 'success' ? 'orbitMcp.copied' : 'orbitMcp.copy',
      })).toBeDefined()
    }
    await press(tree.root.find((node) => node.props.accessibilityState?.expanded === false))
    expect(JSON.stringify(tree.toJSON())).toContain('https://api-staging.useorbit.org/mcp')
    await copySelected()
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('https://api-staging.useorbit.org/mcp')

    await press(tree.root.find((node) => node.props.children === 'orbitMcp.claudeCode' && !!node.props.onPress))
    expect(JSON.stringify(tree.toJSON())).toContain('https://api-staging.useorbit.org/mcp')
    await copySelected()
    expect(JSON.parse(clipboard.setStringAsync.mock.lastCall![0]).mcpServers.orbit.url).toBe(
      'https://api-staging.useorbit.org/mcp',
    )
  })
})
