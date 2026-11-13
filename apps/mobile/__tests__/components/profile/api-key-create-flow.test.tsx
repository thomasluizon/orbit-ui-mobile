import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { ApiKeyCreateResponse } from '@orbit/shared/types'
import { testI18n } from '@/__tests__/support/i18n'
import { ApiKeyCreateFlow } from '@/components/profile/api-key-create-flow'

const mocks = vi.hoisted(() => ({ language: 'en', reducedMotion: false, copy: vi.fn(() => Promise.resolve(true)) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.copy }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')

const createdKey = { id: 'key-1', name: 'Claude Desktop', keyPrefix: 'orb_', scopes: [], isReadOnly: true, expiresAtUtc: null, createdAtUtc: '2026-11-13T00:00:00Z', lastUsedAtUtc: null, isRevoked: false, key: 'orb_secret_value' } satisfies ApiKeyCreateResponse

function Harness({ scoped = false, onCreate, onClose }: Readonly<{ scoped?: boolean; onCreate: (...args: unknown[]) => Promise<ApiKeyCreateResponse | null>; onClose: () => void }>) {
  const [readOnly, setReadOnly] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [created, setCreated] = useState<ApiKeyCreateResponse | null>(null)
  return <ApiKeyCreateFlow scoped={scoped} busy={false} error={null} isReadOnly={readOnly} onReadOnlyChange={setReadOnly} expiresAt={expiresAt} onExpiryChange={setExpiresAt}
    createdKey={created} onCreate={onCreate} onCreateGrantRequired={vi.fn()} onCreated={setCreated} onClose={onClose} />
}

async function render(props: Parameters<typeof Harness>[0]): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => { tree = TestRenderer.create(<Harness {...props} />); await Promise.resolve() })
  return tree
}
const hosts = (tree: TestTree) => tree.root.findAll((node) => typeof node.type === 'string')
const textOf = (node: TestNode): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child as TestNode)).join('')
const texts = (tree: TestTree) => hosts(tree).filter((node) => node.type === 'Text').map(textOf)
const heading = (tree: TestTree) => textOf(hosts(tree).find((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')!)
function button(tree: TestTree, label: string) {
  const found = hosts(tree).find((node) => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || textOf(node) === label))
  if (!found) throw new Error(`No button ${label} in ${texts(tree).join(' | ')}`)
  return found
}
async function press(tree: TestTree, label: string) {
  await TestRenderer.act(async () => { (button(tree, label).props.onPress as () => void)(); await Promise.resolve(); await Promise.resolve() })
}
async function type(tree: TestTree, value: string) {
  const field = hosts(tree).find((node) => node.type === 'TextInput')!
  await TestRenderer.act(() => { (field.props.onChangeText as (text: string) => void)(value) })
}

afterEach(() => { mocks.language = 'en'; mocks.reducedMotion = false })

describe.each([{ language: 'en', messages: en }, { language: 'pt-BR', messages: ptBR }] as const)('Android API key creation flow in $language', ({ language, messages }) => {
  describe.each([false, true])('reduced motion %s', (reducedMotion) => {
    it('asks the place, the access and the expiry, then shows the key once with copy', async () => {
      mocks.language = language
      mocks.reducedMotion = reducedMotion
      const onCreate = vi.fn(() => Promise.resolve(createdKey))
      const onClose = vi.fn()
      const tree = await render({ onCreate, onClose })
      expect(heading(tree)).toBe(messages.orbitMcp.keyName)
      expect(hosts(tree).some((node) => node.props.testID === 'orbit-mascot')).toBe(false)
      await press(tree, messages.common.continue)
      expect(texts(tree)).toContain(messages.orbitMcp.keyNameRequired)
      await type(tree, 'Claude Desktop')
      await press(tree, messages.common.continue)
      expect(heading(tree)).toBe(messages.profile.apiKeys.accessQuestion)
      await press(tree, messages.orbitMcp.permReadOnly)
      expect(heading(tree)).toBe(messages.profile.apiKeys.expiryQuestion)
      await press(tree, messages.common.never)
      expect(onCreate).toHaveBeenCalledWith({ name: 'Claude Desktop', expiresAtUtc: null }, expect.any(Function))
      expect(heading(tree)).toBe(messages.orbitMcp.revealHeading)
      expect(texts(tree)).toContain('orb_secret_value')
      await press(tree, messages.orbitMcp.copy)
      expect(mocks.copy).toHaveBeenCalledWith('orb_secret_value')
      await press(tree, messages.orbitMcp.done)
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('asks what a scoped key can reach and rejects a bad expiry date', async () => {
    mocks.language = language
    const onCreate = vi.fn(() => Promise.resolve(createdKey))
    const tree = await render({ scoped: true, onCreate, onClose: vi.fn() })
    await type(tree, 'Script')
    await press(tree, messages.common.continue)
    await press(tree, messages.orbitMcp.permReadWrite)
    expect(heading(tree)).toBe(messages.profile.apiKeys.scopeLabel)
    await type(tree, 'habits:read')
    await press(tree, messages.common.continue)
    await type(tree, 'soon')
    await press(tree, messages.profile.apiKeys.scopeAction)
    expect(onCreate).not.toHaveBeenCalled()
    expect(texts(tree)).toContain(messages.orbitMcp.invalidExpiry)
  })
})
