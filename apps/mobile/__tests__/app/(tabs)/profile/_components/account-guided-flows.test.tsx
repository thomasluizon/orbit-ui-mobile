import React from 'react'
import { Modal } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { Profile } from '@orbit/shared/types/profile'
import { testI18n } from '@/__tests__/support/i18n'
import { useAuthStore } from '@/stores/auth-store'
import { DeleteAccountModal } from '@/app/(tabs)/profile/_components/delete-account-modal'
import { FreshStartModal } from '@/app/(tabs)/profile/_components/fresh-start-modal'

const mocks = vi.hoisted(() => ({
  language: 'en', reducedMotion: false, online: true, replace: vi.fn(), push: vi.fn(), completed: vi.fn(), event: vi.fn(),
  apiClient: vi.fn(), queued: false,
}))

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({ ...await importOriginal<typeof import('@tanstack/react-query')>(), useQueryClient: () => ({}) }))
vi.mock('@orbit/shared/query', async (importOriginal) => ({ ...await importOriginal<typeof import('@orbit/shared/query')>(), resetAccountQueries: vi.fn(() => Promise.resolve()) }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { multiRemove: vi.fn(() => Promise.resolve()), getItem: vi.fn(() => Promise.resolve(null)), setItem: vi.fn(() => Promise.resolve()), removeItem: vi.fn(() => Promise.resolve()) } }))
vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.apiClient(...args) }))
vi.mock('@/lib/checklist-template-storage', () => ({ clearChecklistTemplates: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/offline-mutations', () => ({
  buildQueuedMutation: vi.fn((mutation: Record<string, unknown>) => ({ id: 'reset-1', ...mutation })),
  createQueuedAck: vi.fn((id: string) => ({ queued: true, queuedMutationId: id })),
  isQueuedResult: vi.fn((result: { queued?: boolean }) => result.queued === true),
  queueOrExecute: vi.fn(({ execute, mutation, queuedResult }: { execute: (mutation: unknown) => Promise<unknown>; mutation: unknown; queuedResult: unknown }) =>
    Promise.resolve(mocks.queued ? queuedResult : execute(mutation))),
}))
vi.mock('@/lib/offline-queue', () => ({ clear: vi.fn(), enqueue: vi.fn() }))
vi.mock('@/lib/query-client', () => ({ clearPersistedQueryCache: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/step-up-storage', () => ({ beginStepUpChallenge: vi.fn(() => Promise.resolve()) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: mocks.event }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode; unmount(): void }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')

async function render(element: React.ReactNode): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => { tree = TestRenderer.create(element); await Promise.resolve() })
  return tree
}
const hosts = (tree: TestTree) => tree.root.findAll((node) => typeof node.type === 'string')
const textOf = (node: TestNode): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child as TestNode)).join('')
const texts = (tree: TestTree) => hosts(tree).filter((node) => node.type === 'Text').map(textOf)
const heading = (tree: TestTree) => hosts(tree).find((node) => node.type === 'Text' && node.props.accessibilityRole === 'header')
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
async function settle() {
  for (let index = 0; index < 6; index += 1) await TestRenderer.act(async () => { await Promise.resolve() })
}

const proProfile = { hasProAccess: true, planExpiresAt: '2999-01-01T00:00:00Z', billingProvider: 'app_store', subscriptionSource: null, email: 'ada@example.com' } as unknown as Profile

beforeEach(() => {
  vi.clearAllMocks()
  mocks.online = true
  mocks.queued = false
  mocks.apiClient.mockResolvedValue({})
  useAuthStore.setState({ user: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' }, sessionPhase: 'signed-in', isAuthenticated: true } as never)
})
afterEach(() => { mocks.language = 'en'; mocks.reducedMotion = false })

describe.each([{ language: 'en', messages: en }, { language: 'pt-BR', messages: ptBR }] as const)('Android fresh start flow in $language', ({ language, messages }) => {
  describe.each([false, true])('reduced motion %s', (reducedMotion) => {
    it('asks what goes and what stays, takes the typed confirmation and closes with the Parado result dialog', async () => {
      mocks.language = language
      mocks.reducedMotion = reducedMotion
      const onClose = vi.fn()
      const tree = await render(<FreshStartModal open guided onClose={onClose} />)
      expect(tree.root.findAll((node) => node.type === Modal)[0]?.props.animationType).toBe(reducedMotion ? 'none' : 'fade')
      expect(textOf(heading(tree)!)).toBe(messages.profile.freshStart.question)
      expect(hosts(tree).some((node) => node.props.testID === 'fresh-start-lists')).toBe(true)
      expect(hosts(tree).some((node) => node.props.testID === 'orbit-mascot')).toBe(false)
      await press(tree, messages.profile.freshStart.reviewDeletion)
      expect(textOf(heading(tree)!)).toBe(messages.profile.freshStart.confirmLabel)
      await press(tree, messages.profile.freshStart.deleteData)
      expect(mocks.apiClient).not.toHaveBeenCalled()
      await type(tree, 'orbit')
      await press(tree, messages.profile.freshStart.deleteData)
      await settle()
      expect(mocks.apiClient).toHaveBeenCalledOnce()
      expect(mocks.completed).toHaveBeenCalledWith('fresh_start', 2, false)
      expect(hosts(tree).some((node) => node.props.testID === 'result-dialog')).toBe(true)
      expect(texts(tree)).toContain(messages.result.account.freshStart)
      await press(tree, messages.result.account.openToday)
      expect(onClose).toHaveBeenCalled()
      expect(mocks.replace).toHaveBeenCalledWith('/(tabs)')
    })
  })

  it('says the reset waits for the connection when it was queued offline', async () => {
    mocks.language = language
    mocks.queued = true
    const tree = await render(<FreshStartModal open guided onClose={vi.fn()} />)
    await press(tree, messages.profile.freshStart.reviewDeletion)
    await type(tree, 'ORBIT')
    await press(tree, messages.profile.freshStart.deleteData)
    await settle()
    expect(texts(tree)).toContain(messages.result.account.freshStartQueued)
  })

  it('keeps the confirmation step with the failure text when the reset fails', async () => {
    mocks.language = language
    mocks.apiClient.mockRejectedValue(new Error('Failed'))
    const tree = await render(<FreshStartModal open guided onClose={vi.fn()} />)
    await press(tree, messages.profile.freshStart.reviewDeletion)
    await type(tree, 'ORBIT')
    await press(tree, messages.profile.freshStart.deleteData)
    await settle()
    expect(hosts(tree).some((node) => node.props.accessibilityRole === 'alert' && textOf(node) === messages.profile.freshStart.errorGeneric)).toBe(true)
    expect(hosts(tree).some((node) => node.props.testID === 'result-dialog')).toBe(false)
  })
})

describe.each([{ language: 'en', messages: en }, { language: 'pt-BR', messages: ptBR }] as const)('Android delete account flow in $language', ({ language, messages }) => {
  it('states the warning for the plan, then sends the code and opens the code entry', async () => {
    mocks.language = language
    const tree = await render(<DeleteAccountModal open guided profile={proProfile} onClose={vi.fn()} />)
    expect(textOf(heading(tree)!)).toBe(messages.profile.deleteAccount.headingAreYouSure)
    expect(texts(tree)).toContain(`${messages.profile.deleteAccount.warningPro} ${messages.profile.deleteAccount.warningAppStore}`)
    expect(hosts(tree).some((node) => node.props.testID === 'orbit-mascot')).toBe(false)
    await press(tree, messages.common.continue)
    expect(textOf(heading(tree)!)).toBe(messages.profile.deleteAccount.sendQuestion)
    expect(texts(tree)).toContain(messages.profile.deleteAccount.sendLine.replace('{email}', 'ada@example.com'))
    await press(tree, messages.profile.deleteAccount.sendCode)
    await settle()
    expect(mocks.apiClient).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/step-up?operation=delete')
  })

  it('blocks the flow offline with the reason and no action', async () => {
    mocks.language = language
    mocks.online = false
    const tree = await render(<DeleteAccountModal open guided profile={proProfile} onClose={vi.fn()} />)
    expect(texts(tree)).toContain(messages.profile.deleteAccount.offlineDescription)
    expect(() => button(tree, messages.common.continue)).toThrow()
  })
})

describe('Android flag off', () => {
  it('keeps the current sheets', async () => {
    const tree = await render(<><FreshStartModal open onClose={vi.fn()} /><DeleteAccountModal open profile={proProfile} onClose={vi.fn()} /></>)
    expect(hosts(tree).some((node) => node.props.testID === 'question-flow')).toBe(false)
  })
})
