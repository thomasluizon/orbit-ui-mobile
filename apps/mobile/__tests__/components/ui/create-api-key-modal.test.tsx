import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types/api-key'

const clipboard = vi.hoisted(() => ({ setString: vi.fn() }))

vi.mock('@react-native-clipboard/clipboard', () => ({ default: clipboard }))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareBottomSheetScrollView: ({ children }: { children: React.ReactNode }) =>
    React.createElement('View', null, children),
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
}))

vi.mock('@/components/ui/chip', () => ({
  Chip: ({ children, onPress, active }: { children: React.ReactNode; onPress: () => void; active: boolean }) =>
    React.createElement(
      'Pressable',
      { accessibilityRole: 'button', accessibilityLabel: `chip:${String(children)}`, accessibilityState: { selected: active }, onPress },
      React.createElement('Text', null, children),
    ),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onPress, disabled, accessibilityLabel }: { children: React.ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) =>
    React.createElement('Pressable', { accessibilityRole: 'button', accessibilityLabel, disabled, onPress }, children),
}))

vi.mock('@/components/ui/settings-row', () => ({
  Switch: ({ onToggle, accessibilityLabel }: { onToggle: () => void; accessibilityLabel: string }) =>
    React.createElement('Pressable', { accessibilityRole: 'button', accessibilityLabel, onPress: onToggle }),
}))

import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}
interface TestTree {
  root: TestNode
  update(element: React.ReactNode): void
}
interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void | Promise<void>): Promise<void> | void
}
const TestRenderer: TestRendererApi = require('react-test-renderer')

const scopes = [
  { scope: 'habits:read', label: 'Read', description: 'read' },
  { scope: 'habits:write', label: 'Write', description: 'write' },
]

function byLabel(tree: TestTree, label: string): TestNode | undefined {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props?.accessibilityLabel === label,
  )[0]
}

function press(tree: TestTree, label: string) {
  const node = byLabel(tree, label)
  if (!node) throw new Error(`no button ${label}`)
  TestRenderer.act(() => {
    ;(node.props as { onPress: () => void }).onPress()
  })
}

function type(tree: TestTree, label: string, value: string) {
  const node = byLabel(tree, label)
  if (!node) throw new Error(`no input ${label}`)
  TestRenderer.act(() => {
    ;(node.props as { onChangeText: (value: string) => void }).onChangeText(value)
  })
}

function texts(tree: TestTree): unknown[] {
  return tree.root.findAll((node) => node.type === 'Text').map((node) => node.props.children)
}

function renderModal(onCreateKey: (request: ApiKeyCreateRequest) => Promise<ApiKeyCreateResponse | null>, onCreated = vi.fn()) {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CreateApiKeyModal
        open
        onOpenChange={vi.fn()}
        availableScopes={scopes}
        onCreateKey={onCreateKey}
        onCreated={onCreated}
      />,
    )
  })
  return { tree, onCreated }
}

describe('CreateApiKeyModal', () => {
  beforeEach(() => {
    clipboard.setString.mockReset()
    vi.useRealTimers()
  })

  it('blocks submission and shows a validation error when the name is empty', () => {
    const onCreateKey = vi.fn().mockResolvedValue(null)
    const { tree } = renderModal(onCreateKey)
    press(tree, 'orbitMcp.createKey')
    expect(onCreateKey).not.toHaveBeenCalled()
    expect(texts(tree)).toContain('orbitMcp.keyNameRequired')
  })

  it('rejects an unparseable expiry date', () => {
    const onCreateKey = vi.fn().mockResolvedValue(null)
    const { tree } = renderModal(onCreateKey)
    type(tree, 'orbitMcp.keyName', 'CI key')
    type(tree, 'orbitMcp.expiresAtLabel', 'not-a-date')
    press(tree, 'orbitMcp.createKey')
    expect(onCreateKey).not.toHaveBeenCalled()
    expect(texts(tree)).toContain('orbitMcp.invalidExpiry')
  })

  it('creates a read-only key with the selected scopes and reveals it', async () => {
    const created: ApiKeyCreateResponse = {
      id: 'k-1',
      name: 'CI key',
      keyPrefix: 'orbit_sk',
      createdAtUtc: '2026-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
      key: 'orbit_sk_secret',
      scopes: ['habits:read', 'habits:write'],
      isReadOnly: true,
      expiresAtUtc: null,
    }
    const onCreateKey = vi.fn().mockResolvedValue(created)
    const { tree, onCreated } = renderModal(onCreateKey)

    type(tree, 'orbitMcp.keyName', 'CI key')
    press(tree, 'common.selectAll')
    press(tree, 'orbitMcp.readOnlyKeyLabel')

    await TestRenderer.act(async () => {
      press(tree, 'orbitMcp.createKey')
    })

    expect(onCreateKey).toHaveBeenCalledWith({
      name: 'CI key',
      scopes: ['habits:read', 'habits:write'],
      isReadOnly: true,
      expiresAtUtc: null,
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(texts(tree)).toContain('orbit_sk_secret')
  })

  it('copies the revealed key to the clipboard', async () => {
    const created: ApiKeyCreateResponse = {
      id: 'k-2',
      name: 'CI key',
      keyPrefix: 'orbit_sk',
      createdAtUtc: '2026-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
      key: 'orbit_sk_copyme',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
    }
    const onCreateKey = vi.fn().mockResolvedValue(created)
    const { tree } = renderModal(onCreateKey)
    type(tree, 'orbitMcp.keyName', 'CI key')
    await TestRenderer.act(async () => {
      press(tree, 'orbitMcp.createKey')
    })
    expect(texts(tree)).toContain('orbit_sk_copyme')
    press(tree, 'orbitMcp.copy')
    expect(clipboard.setString).toHaveBeenCalledWith('orbit_sk_copyme')
    expect(texts(tree)).toContain('orbitMcp.copied')
  })

  it('clears selected scopes', async () => {
    const created: ApiKeyCreateResponse = {
      id: 'k-3',
      name: 'CI key',
      keyPrefix: 'orbit_sk',
      createdAtUtc: '2026-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
      key: 'orbit_sk_noscope',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: null,
    }
    const onCreateKey = vi.fn().mockResolvedValue(created)
    const { tree } = renderModal(onCreateKey)
    type(tree, 'orbitMcp.keyName', 'CI key')
    press(tree, 'common.selectAll')
    press(tree, 'common.clear')
    await TestRenderer.act(async () => {
      press(tree, 'orbitMcp.createKey')
    })
    expect(onCreateKey).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: undefined }),
    )
  })
})
