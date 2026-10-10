import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer'
import Yoga from 'yoga-layout'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import AboutScreen from '@/app/about'
import SupportScreen from '@/app/support'
import UpgradeScreen from '@/app/upgrade'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

const mocks = vi.hoisted(() => ({
  status: null as ReturnType<typeof subscriptionStatusSchema.parse> | null,
  loading: false,
  failed: false,
  online: true,
  apiClient: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('expo-router', () => ({
  useRootNavigationState: () => undefined,
  useRouter: () => ({ push: vi.fn() }), useLocalSearchParams: () => ({}) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.online }) }))
vi.mock('@/hooks/use-subscription-status', () => ({ useSubscriptionStatus: () => ({
  status: mocks.status, isLoading: mocks.loading, isError: mocks.failed, refetch: vi.fn(),
}) }))
vi.mock('@/hooks/use-subscription-plans', () => ({ useSubscriptionPlans: () => ({ plans: null, isLoading: true, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-billing', () => ({ useBilling: () => ({ billing: null, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-play-billing', () => ({ usePlayBilling: () => ({ clearError: vi.fn(), purchase: vi.fn(), restorePurchases: vi.fn() }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showSuccess: vi.fn() }) }))
vi.mock('@/components/onboarding/feature-guide-drawer', () => ({ FeatureGuideDrawer: () => null }))

beforeEach(() => {
  mocks.status = subscriptionStatusSchema.parse({ ...createMockProfile(), source: null, hasProAccess: false, isTrialActive: false })
  mocks.loading = false
  mocks.failed = false
  mocks.online = true
  mocks.apiClient.mockReset().mockResolvedValue(undefined)
})
afterEach(__resetTestHostConfig)

async function renderScreen(screen: React.ReactElement, width: number) {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(screen) })
  return tree
}

function firstView(root: ReactTestInstance) {
  return root.findAll((node) => node.type === View)[0]!
}

function layout(width: number, styles: ViewStyle[]) {
  const column = Yoga.Node.create()
  const nodes = styles.map((style) => {
    const node = Yoga.Node.create()
    if (style.width === '100%') node.setWidthPercent(100)
    if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
    if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
    if (style.alignSelf) node.setAlignSelf({
      auto: Yoga.ALIGN_AUTO, 'flex-start': Yoga.ALIGN_FLEX_START, center: Yoga.ALIGN_CENTER,
      'flex-end': Yoga.ALIGN_FLEX_END, stretch: Yoga.ALIGN_STRETCH, baseline: Yoga.ALIGN_BASELINE,
    }[style.alignSelf])
    return node
  })
  try {
    column.setWidth(width)
    column.setHeight(915)
    nodes.forEach((node, index) => (index === 0 ? column : nodes[index - 1]!).insertChild(node, 0))
    nodes.at(-1)!.setHeight(48)
    column.calculateLayout(width, 915, Yoga.DIRECTION_LTR)
    let left = 0
    return nodes.map((node) => ({ left: left += node.getComputedLeft(), width: node.getComputedWidth() }))
  } finally { column.freeRecursive() }
}

function styleOf(node: ReactTestInstance): ViewStyle {
  return StyleSheet.flatten(node.props.style) ?? {}
}

describe.each([412, 840, 1352])('sub-screen start edges at %ipx', (width) => {
  it('starts About at 16 with the gutter outside its wide content cap', async () => {
    const tree = await renderScreen(<AboutScreen />, width)
    try {
      const content = tree.root.findAll((node) => node.props.testID === 'about-content')[0]!
      const identity = tree.root.findAll((node) => node.props.testID === 'about-identity')[0]!
      const [box, body] = layout(width, [styleOf(content), styleOf(identity)])
      expect(body!.left).toBe(16)
      expect(box!.width).toBe(width < 1024 ? width : 652)
      expect(body!.width).toBe(box!.width - 32)
    } finally { await TestRenderer.act(() => tree.update(<></>)) }
  })

  it.each([true, false])('starts Support and its 520 form at 16, online=%s', async (online) => {
    mocks.online = online
    const tree = await renderScreen(<SupportScreen />, width)
    try {
      const scroll = tree.root.findAll((node) => node.type === ScrollView)[0]!
      const form = firstView(scroll)
      const [box, body] = layout(width, [StyleSheet.flatten(scroll.props.contentContainerStyle) as ViewStyle, styleOf(form)])
      expect(body!.left).toBe(16)
      expect(box!.width).toBe(Math.min(width, 620))
      expect(body!.width).toBe(Math.min(width - 32, 520))
    } finally { await TestRenderer.act(() => tree.update(<></>)) }
  })

  it('starts the sent Support check and heading at 16', async () => {
    const tree = await renderScreen(<SupportScreen />, width)
    try {
      const subject = tree.root.findAll((node) => node.type === Pressable && node.props.accessibilityRole === 'radio')[0]!
      const message = tree.root.findAll((node) => node.props.accessibilityLabel === 'profile.support.message' && typeof node.props.onChangeText === 'function')[0]!
      await TestRenderer.act(() => {
        ;(subject.props.onPress as () => void)()
        ;(message.props.onChangeText as (value: string) => void)('Support request')
      })
      const send = tree.root.findAll((node) => node.props.testID === 'button-primary-md')[0]!
      await TestRenderer.act(async () => {
        ;(send.props.onPress as () => void)()
        await Promise.resolve()
      })
      expect(mocks.apiClient).toHaveBeenCalledTimes(1)
      const scroll = tree.root.findAll((node) => node.type === ScrollView)[0]!
      const success = firstView(scroll)
      const heading = tree.root.findAll((node) => node.type === Text && node.props.children === 'profile.support.success')[0]!
      const check = success.findAll((node) => node.type === View && styleOf(node).width === 44)[0]!
      for (const child of [check, heading]) {
        const [box, , body] = layout(width, [
          StyleSheet.flatten(scroll.props.contentContainerStyle) as ViewStyle, styleOf(success), styleOf(child),
        ])
        expect.soft(body!.left).toBe(16)
        expect.soft(box!.width).toBe(Math.min(width, 620))
      }
    } finally { await TestRenderer.act(() => tree.update(<></>)) }
  })

  it.each(['free', 'offline', 'lapsed', 'stripe', 'play', 'loading', 'load-failed'] as const)
    ('starts the %s upgrade body at 16 with the matching cap', async (state) => {
      mocks.loading = state === 'loading'
      mocks.failed = state === 'load-failed'
      mocks.online = state !== 'offline'
      if (state === 'lapsed') mocks.status = subscriptionStatusSchema.parse({ ...mocks.status, lapseReason: 'expired' })
      if (state === 'stripe' || state === 'play') mocks.status = subscriptionStatusSchema.parse({
        ...mocks.status, plan: 'pro', hasProAccess: true, isTrialActive: false, source: state,
      })
      const tree = await renderScreen(<UpgradeScreen />, width)
      try {
        const pitch = state === 'free' || state === 'offline'
        const scroll = tree.root.findAll((node) => node.props.contentContainerStyle !== undefined)[0]!
        const root = firstView(scroll)
        const content = root.findAll((node) => node.type === View)[1]!
        const [box, body] = layout(width, [styleOf(root), styleOf(content)])
        expect.soft(body!.left).toBe(16)
        expect.soft(box!.left).toBe(0)
        expect.soft(box!.width).toBe(width < 1024 ? width : (pitch ? 652 : 560) + 32)
        expect.soft(body!.width).toBe(width < 1024 ? width - 32 : pitch ? 652 : 560)
      } finally { await TestRenderer.act(() => tree.update(<></>)) }
    })
})
