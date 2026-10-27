import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { PersonalText } from '@/components/ui/personal-text'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { AccountRowsCard } from '@/components/chat/account-rows-card'
import { controlName, renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const rewardState = vi.hoisted(() => ({ stats: { rewardType: 'pro_days', proDaysPerReferral: 7, discountPercent: 23 }, locale: '' }))
const referralRead = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-referral', () => ({ useReferral: () => { referralRead(); return { stats: rewardState.stats } } }))
const mocks = vi.hoisted(() => ({ push: vi.fn(), setStringAsync: vi.fn().mockResolvedValue(true), share: vi.fn(), locale: 'en' }))
vi.mock('react-native', async () => {
  const reactNative = await import('../../../test-mocks/react-native')
  return { ...reactNative, Share: { share: mocks.share } }
})
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
const testI18n = createInstance()
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default
void testI18n.use(ICU).init({ resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } }, lng: 'en', fallbackLng: 'en', initAsync: false })
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => rewardState.locale ? testI18n.getFixedT(rewardState.locale)(key, params) : params ? `${key}:${JSON.stringify(params)}` : key, i18n: { language: rewardState.locale || mocks.locale } }) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.setStringAsync }))
vi.mock('@/components/ui/settings-group', () => ({ SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }))
vi.mock('@/components/ui/pill-button', async (importOriginal) => ({ ...await importOriginal<typeof import('@/components/ui/pill-button')>(), Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable> }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ body, actions }: BlockFrameProps) => <View>{body}{actions}</View> }))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return { ...actual, createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }
})

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree
}

describe('Astra account rows on mobile', () => {
  beforeEach(() => { vi.clearAllMocks(); rewardState.locale = ''; mocks.locale = 'en' })

  it('keeps plan rows read only and drops unknown keys', () => {
    const tree = render(<AccountRowsCard accountRows={{ kind: 'plan', surfaceId: 'profile', rows: [
      { key: 'plan', value: 'Pro', valueType: 'enum' },
      { key: 'lifetime', value: 'false', valueType: 'boolean' },
      { key: 'unknownKey', value: 'hidden', valueType: 'text' },
    ] }} />)
    const output = renderedText(tree.toJSON())
    expect(output).toContain('chat.account.value.plan.Pro')
    expect(output).toContain('chat.account.no')
    expect(output).not.toContain('hidden')
    expect(output).not.toContain('upgrade.')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('keeps an account email intact and reveals its complete value in one tap', async () => {
    const email = `${'longaddress'.repeat(12)}@example.com`
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<AccountRowsCard accountRows={{ kind: 'profile', surfaceId: 'profile', rows: [{ key: 'email', value: email, valueType: 'text' }] }} />) })
    const preview = tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === email)
    expect(preview).toHaveLength(1)
    expect(preview[0]!.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' })
    const disclosure = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === `chat.account.row.email, ${email}`)[0]!
    expect(disclosure.props.accessibilityState).toMatchObject({ expanded: false })
    const onPress = disclosure.props.onPress
    if (typeof onPress !== 'function') throw new Error('Account disclosure missing')
    await act(() => { onPress() })
    expect(disclosure.props.accessibilityState).toMatchObject({ expanded: true })
    expect(tree.root.findAll((node) => node.type === PersonalText && node.props.children === email && node.props.expanded === true)).toHaveLength(1)
    expect(mocks.push).not.toHaveBeenCalled()
    await act(() => tree.update(<></>))
  })

  it('copies the referral code and opens the native share sheet', async () => {
    mocks.share.mockResolvedValue({ action: 'sharedAction' })
    const tree = render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', rows: [], referralCode: 'ORBIT123', referralLink: 'https://example.com/r/ORBIT123' }} />)
    const code = tree.root.findAll((node: any) => node.type === Text && node.props.children === 'ORBIT123')[0]
    expect(code.props.numberOfLines).toBeUndefined()
    const copy = tree.root.findByProps({ accessibilityLabel: 'chat.account.copy' })
    await TestRenderer.act(async () => { await copy.props.onPress() })
    expect(mocks.setStringAsync).toHaveBeenCalledWith('ORBIT123')
    expect(renderedText(tree.toJSON())).toContain('chat.account.copied')
    const openShare = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && controlName(node).includes('chat.account.share'))[0]
    await TestRenderer.act(async () => { openShare.props.onPress(); await Promise.resolve() })
    expect(mocks.share).toHaveBeenCalledWith({ title: 'referral.share.title', message: 'referral.share.proDays:{"proDays":7} https://example.com/r/ORBIT123' })
  })

  it('confirms a referral code only after the native write and permits retry after rejection', async () => {
    const tree = render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', rows: [], referralCode: 'ORBIT123' }} />)
    mocks.setStringAsync.mockRejectedValueOnce(new Error('Clipboard unavailable'))
    await act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.account.copy' }).props.onPress(); await Promise.resolve() })
    expect(renderedText(tree.toJSON())).toContain('chat.account.copyError')
    expect(renderedText(tree.toJSON())).not.toContain('chat.account.copied')
    let finishWrite!: (written: boolean) => void
    const write = new Promise<boolean>((resolve) => { finishWrite = resolve })
    mocks.setStringAsync.mockReturnValueOnce(write)
    await act(async () => { tree.root.findByProps({ accessibilityLabel: 'chat.account.copy' }).props.onPress(); await Promise.resolve() })
    expect(mocks.setStringAsync).toHaveBeenLastCalledWith('ORBIT123')
    expect(renderedText(tree.toJSON())).not.toContain('chat.account.copied')
    await act(async () => { finishWrite(true); await write })
    expect(renderedText(tree.toJSON())).toContain('chat.account.copied')
    expect(renderedText(tree.toJSON())).not.toContain('chat.account.copyError')
    await act(() => tree.unmount())
  })

  it('formats a plan date in pt-BR', () => {
    mocks.locale = 'pt-BR'
    const tree = render(<AccountRowsCard accountRows={{ kind: 'plan', surfaceId: 'profile', rows: [{ key: 'trialEnd', value: '2026-09-26T12:00:00Z', valueType: 'date' }] }} />)
    expect(renderedText(tree.toJSON())).toContain('26 de set. de 2026')
  })
  it.each(['en', 'pt-BR'])('recognizes the actual Pro-days record and hides its unrelated percent in %s', async (locale) => {
    rewardState.locale = locale
    const tree = render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', referralCode: 'ORBIT123', referralLink: 'https://example.com/r/ORBIT123', rows: [
      { key: 'successfulReferrals', value: '8', valueType: 'count' },
      { key: 'pendingReferrals', value: '2', valueType: 'count' },
      { key: 'maxReferrals', value: '10', valueType: 'count' },
      { key: 'rewardType', value: 'pro_days', valueType: 'enum' },
      { key: 'discountPercent', value: '23', valueType: 'count' },
    ] }} />)
    expect(renderedText(tree.toJSON())).toContain(locale === 'en' ? 'Days of Pro' : 'Dias de Pro')
    expect(renderedText(tree.toJSON())).not.toContain('23%')
    const label = testI18n.getFixedT(locale)('chat.account.share')
    const share = tree.root.findAll((node: { props: { onPress?: () => void; children?: unknown } }) => typeof node.props.onPress === 'function' && controlName(node) === label)[0]
    await act(async () => { share.props.onPress(); await Promise.resolve() })
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(locale === 'en' ? 'I can earn 7 days of Pro.' : 'Eu posso ganhar 7 dias de Pro.') }))
    await act(() => tree.unmount())
  })

  it.each(['profile', 'plan'] as const)('does not read the referral dashboard for a %s record', (kind) => {
    const tree = render(<AccountRowsCard accountRows={{ kind, surfaceId: 'profile', rows: [] }} />)
    expect(referralRead).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

})

it('renders the profile when the time zone is unsupported', () => {
  const tree = render(<AccountRowsCard accountRows={{ kind: 'profile', surfaceId: 'profile', rows: [{ key: 'timeZone', value: 'Unsupported/Zone', valueType: 'text' }] }} />)
  expect(renderedText(tree.toJSON())).toContain('Unsupported/Zone')
})
