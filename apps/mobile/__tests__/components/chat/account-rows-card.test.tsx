import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { AccountRowsCard } from '@/components/chat/account-rows-card'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ push: vi.fn(), setString: vi.fn(), share: vi.fn() }))
vi.mock('react-native', async () => {
  const reactNative = await import('../../../test-mocks/react-native')
  return { ...reactNative, Share: { share: mocks.share } }
})
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: mocks.setString } }))
vi.mock('@/components/ui/list-row', () => ({ ListRow: ({ title, value }: { title: string; value: string }) => <View><Text>{title}</Text><Text>{value}</Text></View> }))
vi.mock('@/components/ui/settings-group', () => ({ SettingsGroup: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }))
vi.mock('@/components/ui/pill-button', () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable> }))
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
  beforeEach(() => { vi.clearAllMocks() })

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
    const open = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.account.open'))[0]
    TestRenderer.act(() => open.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/profile')
  })

  it('copies the referral code and opens the native share sheet', async () => {
    mocks.share.mockResolvedValue({ action: 'sharedAction' })
    const tree = render(<AccountRowsCard accountRows={{ kind: 'referral', surfaceId: 'profile', rows: [], referralCode: 'ORBIT123', referralLink: 'https://example.com/r/ORBIT123' }} />)
    const code = tree.root.findAll((node: any) => node.type === Text && node.props.children === 'ORBIT123')[0]
    expect(code.props.numberOfLines).toBeUndefined()
    const copy = tree.root.findByProps({ accessibilityLabel: 'chat.account.copy' })
    TestRenderer.act(() => copy.props.onPress())
    expect(mocks.setString).toHaveBeenCalledWith('ORBIT123')
    expect(renderedText(tree.toJSON())).toContain('chat.account.copied')
    const openShare = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.account.share'))[0]
    await TestRenderer.act(async () => { openShare.props.onPress(); await Promise.resolve() })
    expect(mocks.share).toHaveBeenCalledWith({ title: 'referral.share.title', message: 'https://example.com/r/ORBIT123' })
  })
})
