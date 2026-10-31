import { SECONDARY_TEXT_SIZE } from '@orbit/shared/theme'
import { afterEach, expect, it, vi } from 'vitest'
import { StyleSheet, View, type ViewStyle, type TextStyle } from 'react-native'
import { act, create } from 'react-test-renderer'
import { AstraOffer } from '@/components/chat/astra-offer'
import { useChatStore } from '@/stores/chat-store'
import { astraOfferFixture, offerConversationId } from '@orbit/shared/test-support/astra-offer-fixtures'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
type Host = Parameters<typeof measureProfileRow>[0] & { props: { width?: number; height?: number } }
function measurable(host: Host): Host {
  if (host.type === 'Svg') return { ...host, props: { ...host.props, style: { width: host.props.width, height: host.props.height } }, children: null }
  return { ...host, children: host.children?.map(child => typeof child === 'string' ? child : measurable(child)) ?? null }
}
afterEach(async () => { __resetTestHostConfig(); useChatStore.setState({ conversationId: null, dismissedOfferKeys: [] }); await i18n.changeLanguage('en') })

it.each([320, 360, 384, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale => (['openSurface', 'continueChat'] as const).map(kind => ({ width, locale, kind })))))('keeps the native offer whole at $width in $locale for $kind', async ({ width, locale, kind }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  await i18n.changeLanguage(locale)
  useChatStore.setState({ conversationId: offerConversationId, dismissedOfferKeys: [] })
  const label = kind === 'openSurface' ? locale === 'en' ? 'Review Astra settings' : 'Ver configurações da Astra'
    : locale === 'en' ? 'Use with a habit' : 'Usar em um hábito'
  let tree!: ReturnType<typeof create> & { toJSON: () => Host }
  await act(() => { tree = create(<View style={{ padding: 32 }}><AstraOffer action={{ ...astraOfferFixture, kind, surface: 'ai-settings', label }} onSendMessage={vi.fn()} /></View>) as typeof tree })
  try {
    const status = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')[0]!
    expect(StyleSheet.flatten(status.props.style as TextStyle).fontSize).toBe(SECONDARY_TEXT_SIZE)
    const geometry = measureProfileRow(measurable(tree.toJSON()), width, 1)
    const text = geometry.texts.find(entry => entry.label === label)!
    expect(text).toBeDefined()
    expect(text.lines).toBe(1)
    expect(text.clipped).toBe(false)
    const control = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label)[0]!
    await act(() => (control.props.onFocus as () => void)())
    const style = StyleSheet.flatten((typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style) as ViewStyle)
    expect(style.outlineWidth).toBe(2)
    expect(style.borderColor).toBe('transparent')
    const dismiss = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === i18n.t('chat.offers.dismiss'))
    expect(dismiss).toHaveLength(1)
  } finally { await act(() => tree.unmount()) }
})
