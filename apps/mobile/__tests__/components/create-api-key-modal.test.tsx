import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from '@orbit/shared/types/api-key'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'

const TestRenderer = require('react-test-renderer')

type CreateKeyFn = (
  request: ApiKeyCreateRequest,
) => Promise<ApiKeyCreateResponse | null>

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

vi.mock('@react-native-clipboard/clipboard', () => ({
  default: { setString: vi.fn() },
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
}))

vi.mock('@/components/bottom-sheet-modal', () => ({
  BottomSheetModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement(React.Fragment, null, children) : null,
}))

vi.mock('@/components/ui/keyboard-aware-scroll-view', () => ({
  KeyboardAwareBottomSheetScrollView: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

vi.mock('@/components/ui/bottom-sheet-app-text-input', () => ({
  BottomSheetAppTextInput: (props: Record<string, unknown>) =>
    React.createElement('TextInput', props),
}))

vi.mock('@/components/ui/chip', () => ({
  Chip: ({ children }: { children: React.ReactNode }) =>
    React.createElement('Chip', null, children),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, onPress, accessibilityLabel }: Record<string, unknown>) =>
    React.createElement(
      'PillButton',
      { onPress, accessibilityLabel },
      children as React.ReactNode,
    ),
}))

vi.mock('@/components/ui/settings-row', () => ({
  Switch: () => null,
}))

function findByAccessibilityLabel(
  tree: { root: { findAll: (predicate: (node: any) => boolean) => any[] } },
  label: string,
) {
  return tree.root.findAll((node: any) => node.props?.accessibilityLabel === label)
}

function flattenText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return flattenText((node as { props: { children?: unknown } }).props.children)
  }
  return ''
}

function screenTexts(tree: { root: { findAllByType: (type: string) => any[] } }): string[] {
  return tree.root.findAllByType('Text').map((node) => flattenText(node.props.children))
}

async function renderModal(onCreateKey: CreateKeyFn) {
  let tree: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <CreateApiKeyModal
        open
        onOpenChange={vi.fn()}
        availableScopes={[]}
        onCreateKey={onCreateKey}
      />,
    )
    await Promise.resolve()
  })
  return tree
}

function getNameInput(tree: { root: { findAll: (p: (n: any) => boolean) => any[] } }) {
  return findByAccessibilityLabel(tree, 'orbitMcp.keyName')[0]
}

function getExpiryInput(tree: { root: { findAll: (p: (n: any) => boolean) => any[] } }) {
  return findByAccessibilityLabel(tree, 'orbitMcp.expiresAtLabel')[0]
}

function getSubmitButton(tree: { root: { findAll: (p: (n: any) => boolean) => any[] } }) {
  return findByAccessibilityLabel(tree, 'orbitMcp.createKey')[0]
}

describe('CreateApiKeyModal (mobile) — API-key expiry parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses a valid expiry as a UTC timestamp without timezone shifting', async () => {
    const onCreateKey = vi.fn<CreateKeyFn>().mockResolvedValue({
      id: 'key-1',
      key: 'sk-test-123',
      name: 'My Key',
      keyPrefix: 'sk-test',
      scopes: [],
      isReadOnly: false,
      expiresAtUtc: '2026-04-20T18:45:00.000Z',
      createdAtUtc: '2025-01-01T00:00:00Z',
      lastUsedAtUtc: null,
      isRevoked: false,
    })

    const tree = await renderModal(onCreateKey)

    await TestRenderer.act(async () => {
      getNameInput(tree).props.onChangeText('My Key')
      getExpiryInput(tree).props.onChangeText('2026-04-20T18:45')
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      getSubmitButton(tree).props.onPress()
      await Promise.resolve()
    })

    expect(onCreateKey).toHaveBeenCalledWith({
      name: 'My Key',
      scopes: undefined,
      isReadOnly: false,
      expiresAtUtc: '2026-04-20T18:45:00.000Z',
    })
  })

  it('rejects a malformed expiry with the shared invalid-expiry key', async () => {
    const onCreateKey = vi.fn<CreateKeyFn>()
    const tree = await renderModal(onCreateKey)

    await TestRenderer.act(async () => {
      getNameInput(tree).props.onChangeText('My Key')
      getExpiryInput(tree).props.onChangeText('not-a-date')
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      getSubmitButton(tree).props.onPress()
      await Promise.resolve()
    })

    expect(onCreateKey).not.toHaveBeenCalled()
    expect(screenTexts(tree)).toContain('orbitMcp.invalidExpiry')
  })

  it('rejects a name longer than the shared maximum', async () => {
    const onCreateKey = vi.fn<CreateKeyFn>()
    const tree = await renderModal(onCreateKey)

    await TestRenderer.act(async () => {
      getNameInput(tree).props.onChangeText('A'.repeat(51))
      await Promise.resolve()
    })

    await TestRenderer.act(async () => {
      getSubmitButton(tree).props.onPress()
      await Promise.resolve()
    })

    expect(onCreateKey).not.toHaveBeenCalled()
    expect(screenTexts(tree)).toContain('orbitMcp.keyNameMaxLength')
  })
})
