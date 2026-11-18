import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { ApiKeyCreateResponse } from '@orbit/shared/types'
import { testI18n } from '@/__tests__/support/i18n'
import { ApiKeyCreateFlow } from '@/components/profile/api-key-create-flow'
import { captureGuidedFlowEvent } from '@/lib/posthog'

const mocks = vi.hoisted(() => ({ language: 'en', reducedMotion: false, copy: vi.fn(() => Promise.resolve(true)) }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.copy }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/date-field', () => ({ DateField: (props: Record<string, unknown>) => React.createElement('DateField', props) }))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; parent: TestNode | null; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')

const createdKey = { id: 'key-1', name: 'Claude Desktop', keyPrefix: 'orb_', scopes: [], isReadOnly: true, expiresAtUtc: null, createdAtUtc: '2026-11-13T00:00:00Z', lastUsedAtUtc: null, isRevoked: false, key: 'orb_secret_value' } satisfies ApiKeyCreateResponse

function Harness({ scoped = false, draft = '', timeZone = 'America/Sao_Paulo', trackBusy = false, onCreate, onClose }: Readonly<{ scoped?: boolean; draft?: string; timeZone?: string; trackBusy?: boolean; onCreate: (...args: unknown[]) => Promise<ApiKeyCreateResponse | null>; onClose: () => void }>) {
  const [readOnly, setReadOnly] = useState(false)
  const [expiresAt, setExpiresAt] = useState(draft)
  const [created, setCreated] = useState<ApiKeyCreateResponse | null>(null)
  const [handedOff, setHandedOff] = useState(false)
  const [busy, setBusy] = useState(false)
  if (handedOff) return null
  const create = trackBusy
    ? async (...args: unknown[]) => { setBusy(true); try { return await onCreate(...args) } finally { setBusy(false) } }
    : onCreate
  return <ApiKeyCreateFlow scoped={scoped} busy={busy} error={null} isReadOnly={readOnly} onReadOnlyChange={setReadOnly} expiresAt={expiresAt} timeZone={timeZone} onExpiryChange={setExpiresAt}
    createdKey={created} onCreate={create} onCreateGrantRequired={() => setHandedOff(true)} onCreated={setCreated} onClose={onClose} />
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
const datePicker = (tree: TestTree) => tree.root.findAll((node) => node.type === 'DateField')[0]!
async function type(tree: TestTree, value: string) {
  const field = hosts(tree).find((node) => node.type === 'TextInput')!
  await TestRenderer.act(() => { (field.props.onChangeText as (text: string) => void)(value) })
}

afterEach(() => { mocks.language = 'en'; mocks.reducedMotion = false; vi.useRealTimers() })

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
      expect(hosts(tree).some((node) => node.type === 'TextInput')).toBe(false)
      expect(texts(tree)).not.toContain(messages.orbitMcp.expiryFormatExample)
      expect(datePicker(tree).props.label).toBe(messages.profile.apiKeys.expiryDayLabel)
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

  it('asks what a scoped key can reach before the expiry, and creates it to the end of the day picked in the account zone', async () => {
    mocks.language = language
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 10, 15, 23, 0))
    const onCreate = vi.fn((..._args: unknown[]) => Promise.resolve(createdKey))
    const tree = await render({ scoped: true, timeZone: 'Asia/Tokyo', onCreate, onClose: vi.fn() })
    await type(tree, 'Script')
    await press(tree, messages.common.continue)
    await press(tree, messages.orbitMcp.permReadWrite)
    expect(heading(tree)).toBe(messages.profile.apiKeys.scopeLabel)
    await type(tree, 'habits:read')
    await press(tree, messages.common.continue)
    expect(datePicker(tree).props.minDate).toBe('2026-11-16')
    await TestRenderer.act(() => { (datePicker(tree).props.onChange as (day: string) => void)('2026-11-20') })
    expect(datePicker(tree).props.value).toBe('2026-11-20')
    await press(tree, messages.profile.apiKeys.scopeAction)
    expect(onCreate).toHaveBeenCalledWith({ name: 'Script', scopes: ['habits:read'], expiresAtUtc: '2026-11-20T14:59:59.000Z' }, expect.any(Function))
  })

  it('hands the flow to the code question without reporting it as left', async () => {
    mocks.language = language
    vi.mocked(captureGuidedFlowEvent).mockClear()
    const onCreate = vi.fn(async (_request: unknown, onCreateGrantRequired: () => Promise<void>) => { await onCreateGrantRequired(); return null })
    const tree = await render({ onCreate: onCreate as (...args: unknown[]) => Promise<ApiKeyCreateResponse | null>, onClose: vi.fn() })
    await type(tree, 'Script')
    await press(tree, messages.common.continue)
    await press(tree, messages.orbitMcp.permReadOnly)
    await press(tree, messages.common.never)
    expect(onCreate).toHaveBeenCalledOnce()
    expect(hosts(tree)).toHaveLength(0)
    const events = vi.mocked(captureGuidedFlowEvent).mock.calls.map(([event]) => event.name)
    expect(events).toContain('guided_flow_step_viewed')
    expect(events).not.toContain('guided_flow_abandoned')
  })

  it('keeps the flow on the expiry step with no close path while the create request runs', async () => {
    mocks.language = language
    let resolveCreate: (value: ApiKeyCreateResponse) => void = () => {}
    const onCreate = vi.fn(() => new Promise<ApiKeyCreateResponse | null>((resolve) => { resolveCreate = resolve }))
    const onClose = vi.fn()
    const tree = await render({ trackBusy: true, onCreate, onClose })
    await type(tree, 'Script')
    await press(tree, messages.common.continue)
    await press(tree, messages.orbitMcp.permReadOnly)
    await press(tree, messages.common.never)
    expect(onCreate).toHaveBeenCalledOnce()
    expect(hosts(tree).some((node) => node.props.accessibilityLabel === messages.common.close)).toBe(false)
    expect(hosts(tree).some((node) => node.props.accessibilityLabel === messages.common.back)).toBe(false)
    const modal = hosts(tree).find((node) => typeof node.props.onRequestClose === 'function')!
    await TestRenderer.act(async () => { (modal.props.onRequestClose as () => void)(); await Promise.resolve() })
    expect(heading(tree)).toBe(messages.profile.apiKeys.expiryQuestion)
    expect(texts(tree)).not.toContain(messages.common.discardChangesTitle)
    expect(onClose).not.toHaveBeenCalled()
    await TestRenderer.act(async () => { resolveCreate(createdKey); await Promise.resolve() })
    expect(heading(tree)).toBe(messages.orbitMcp.revealHeading)
  })

  it('opens the discard sheet inside the flow screen, because a sheet beside the flow modal lands under it', async () => {
    mocks.language = language
    const tree = await render({ onCreate: vi.fn(() => Promise.resolve(createdKey)), onClose: vi.fn() })
    await type(tree, 'Script')
    await press(tree, messages.common.close)
    const title = hosts(tree).find((node) => node.type === 'Text' && textOf(node) === messages.common.discardChangesTitle)
    expect(title).toBeDefined()
    const ancestors: unknown[] = []
    for (let node = title!.parent; node; node = node.parent) ancestors.push(node.props.testID)
    expect(ancestors).toContain('flow-screen')
  })

  it('refuses a kept expiry draft that is in the past, with the reason under the date', async () => {
    mocks.language = language
    const onCreate = vi.fn((..._args: unknown[]) => Promise.resolve(createdKey))
    const tree = await render({ draft: '2020-01-01T23:59', onCreate, onClose: vi.fn() })
    await type(tree, 'Script')
    await press(tree, messages.common.continue)
    await press(tree, messages.orbitMcp.permReadWrite)
    expect(datePicker(tree).props.value).toBe('2020-01-01')
    await press(tree, messages.profile.apiKeys.scopeAction)
    expect(onCreate).not.toHaveBeenCalled()
    expect(hosts(tree).filter((node) => node.props.accessibilityRole === 'alert').map(textOf)).toEqual([messages.profile.apiKeys.expiryDayPassed])
  })
})
