import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { testI18n } from '@/__tests__/support/i18n'
import { createTokensV2 } from '@/lib/theme'
import { MarketingConsentSection } from '@/components/marketing-consent/marketing-consent-section'
import { PushDevicesRow } from '@/components/profile/push-devices-row'
import { EditNameSheet } from '@/app/(tabs)/profile/_components/edit-name-sheet'

const mocks = vi.hoisted(() => ({ language: 'en', consent: null as boolean | null, mutate: vi.fn(), patchProfile: vi.fn() }))
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: testI18n.getFixedT(mocks.language), i18n: { language: mocks.language } }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { name: 'Ada', email: 'ada@example.com', marketingEmailConsent: mocks.consent }, patchProfile: mocks.patchProfile, invalidate: vi.fn() }),
}))
vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: (...args: unknown[]) => mocks.mutate(...args) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/app-text-input', () => ({ AppTextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props) }))

interface TestNode { type: unknown; props: Record<string, unknown>; children: unknown[]; findAll(predicate: (node: TestNode) => boolean): TestNode[] }
interface TestTree { root: TestNode }
const TestRenderer: { create(element: React.ReactNode): TestTree; act(callback: () => void | Promise<void>): Promise<void> } = require('react-test-renderer')

async function render(node: React.ReactNode): Promise<TestTree> {
  let tree!: TestTree
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  await TestRenderer.act(async () => { tree = TestRenderer.create(<QueryClientProvider client={client}>{node}</QueryClientProvider>); await Promise.resolve() })
  return tree
}
const hosts = (tree: TestTree) => tree.root.findAll((node) => typeof node.type === 'string')
const textOf = (node: TestNode): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child as TestNode)).join('')
const texts = (tree: TestTree) => hosts(tree).filter((node) => node.type === 'Text').map(textOf)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.consent = null
  mocks.mutate.mockResolvedValue(undefined)
})
afterEach(() => { mocks.language = 'en' })

describe.each([{ language: 'en', messages: en }, { language: 'pt-BR', messages: ptBR }] as const)('Android Perfil settings with orbit_guided_flows in $language', ({ language, messages }) => {
  it('answers the product email question with two quick options', async () => {
    mocks.language = language
    const tree = await render(<MarketingConsentSection showSectionLabel={false} contained guided />)
    expect(texts(tree)).toContain(messages.profile.marketingEmails.question)
    const group = hosts(tree).find((node) => node.props.accessibilityRole === 'radiogroup')!
    expect(group.props.accessibilityLabel).toBe(messages.profile.marketingEmails.question)
    const accept = group.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && textOf(node) === messages.profile.marketingEmails.accept)[0]!
    await TestRenderer.act(async () => { (accept.props.onPress as () => void)(); await Promise.resolve(); await Promise.resolve() })
    expect(mocks.patchProfile).toHaveBeenCalledWith({ marketingEmailConsent: true })
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ type: 'setMarketingConsent', payload: { enabled: true } }))
  })

  it('titles the name sheet with its question and drops the repeated visible label', async () => {
    mocks.language = language
    const tree = await render(<EditNameSheet open guided onClose={vi.fn()} />)
    expect(texts(tree).filter((text) => text === messages.profile.editName.label)).toHaveLength(1)
    expect(texts(tree)).not.toContain(messages.profile.editName.title)
    expect(hosts(tree).find((node) => node.type === 'TextInput')?.props.accessibilityLabel).toBe(messages.profile.editName.label)
  })

  it('draws a skeleton and no spinner while the push devices load', async () => {
    mocks.language = language
    const tree = await render(<PushDevicesRow tokens={createTokensV2('purple', 'dark')} count={undefined} max={undefined} currentDeviceRegistered={false} supported loading error={false} permissionStatus={null} registrationStatus="idle" onToggle={vi.fn()} onOpenSettings={vi.fn()} onRetry={vi.fn()} />)
    expect(hosts(tree).some((node) => node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === messages.profile.loading)).toBe(true)
    expect(hosts(tree).some((node) => node.type === 'ActivityIndicator')).toBe(false)
    expect(texts(tree)).not.toContain(messages.profile.loading)
  })
})

it('keeps the current answers and name sheet title on Android with the flag off', async () => {
  const tree = await render(<><MarketingConsentSection showSectionLabel={false} contained /><EditNameSheet open onClose={vi.fn()} /></>)
  expect(hosts(tree).some((node) => node.props.accessibilityRole === 'radiogroup')).toBe(false)
  expect(texts(tree)).toContain(en.profile.editName.title)
})
