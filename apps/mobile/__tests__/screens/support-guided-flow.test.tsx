import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { testI18n } from '@/__tests__/support/i18n'
import SupportScreen from '@/app/support'

const mocks = vi.hoisted(() => ({ language: 'en', online: true, guided: true, apiClient: vi.fn(), push: vi.fn(), goBack: vi.fn(), completed: vi.fn(), reducedMotion: false }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(() => Promise.resolve(null)), setItem: vi.fn(() => Promise.resolve()), removeItem: vi.fn(() => Promise.resolve()) } }))
vi.mock('@/lib/api-client', () => ({ apiClient: (...args: unknown[]) => mocks.apiClient(...args) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Ada', email: 'ada@example.com' } }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.goBack }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/support' }))
vi.mock('@/hooks/use-back-label', () => ({ useBackLabel: () => 'Back' }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => mocks.reducedMotion }))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')

async function render(): Promise<TestTree> {
  let tree!: TestTree
  await TestRenderer.act(async () => { tree = TestRenderer.create(<SupportScreen />); await Promise.resolve() })
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.online = true
  mocks.guided = true
  mocks.apiClient.mockResolvedValue({})
})
afterEach(() => { mocks.language = 'en'; mocks.reducedMotion = false })

describe.each([{ language: 'en', messages: en }, { language: 'pt-BR', messages: ptBR }] as const)('Android guided support request in $language', ({ language, messages }) => {
  describe.each([false, true])('reduced motion %s', (reducedMotion) => {
    it('asks the subject with quick options, then the message, and closes with the Feliz result dialog', async () => {
      mocks.language = language
      mocks.reducedMotion = reducedMotion
      const tree = await render()
      expect(heading(tree)).toBe(messages.profile.support.subject)
      expect(hosts(tree).some((node) => node.props.testID === 'orbit-mascot')).toBe(false)
      await press(tree, messages.profile.support.subjects.billing.option)
      expect(heading(tree)).toBe(messages.profile.support.message)
      await press(tree, messages.profile.support.send)
      expect(mocks.apiClient).not.toHaveBeenCalled()
      expect(texts(tree)).toContain(messages.profile.support.messageRequired)
      await type(tree, 'The walk went back to pending.')
      await press(tree, messages.profile.support.send)
      expect(mocks.apiClient).toHaveBeenCalledOnce()
      expect(mocks.completed).toHaveBeenCalledWith('support_request', 2, false)
      expect(hosts(tree).some((node) => node.props.testID === 'result-dialog')).toBe(true)
      expect(texts(tree)).toContain(messages.result.support.sent.replace('{email}', 'ada@example.com'))
      await press(tree, messages.profile.support.backToAbout)
      expect(mocks.push).toHaveBeenCalledWith('/about')
    })
  })

  it('keeps the message step with the failure text and retry when sending fails', async () => {
    mocks.language = language
    mocks.apiClient.mockRejectedValue(new Error('Failed'))
    const tree = await render()
    await press(tree, messages.profile.support.subjects.problem.option)
    await type(tree, 'It broke.')
    await press(tree, messages.profile.support.send)
    expect(texts(tree)).toContain(messages.profile.support.failureTitle)
    expect(button(tree, messages.profile.support.retry)).toBeDefined()
    expect(hosts(tree).some((node) => node.props.testID === 'result-dialog')).toBe(false)
  })

  it('keeps the words offline and states the reason', async () => {
    mocks.language = language
    mocks.online = false
    const tree = await render()
    await press(tree, messages.profile.support.subjects.other.option)
    await type(tree, 'Later.')
    await press(tree, messages.profile.support.send)
    expect(texts(tree)).toContain(messages.profile.support.offlineReason)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })
})

it('keeps the current form on Android with the flag off', async () => {
  mocks.guided = false
  const tree = await render()
  expect(hosts(tree).some((node) => node.props.testID === 'question-flow')).toBe(false)
})
