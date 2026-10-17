import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { buildComposerChips } from '@orbit/shared/chat'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PromptLibrary } from '@/components/chat/prompt-library'
import { AstraConversation } from '@/components/chat/conversation'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { i18n } from '@/lib/i18n'
import { __getFocusedInputSelection, __getFocusedNativeTag, __resetTestHostConfig } from '@/test-mocks/react-native'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
const overlay = vi.hoisted(() => ({ back: () => {} }))
vi.mock('@/hooks/use-overlay-back', () => ({ useOverlayBack: (_active: boolean, back: () => void) => { overlay.back = back } }))

type HostProps = {
  accessibilityRole?: string
  accessibilityLabel?: string
  accessibilityState: { disabled: boolean }
  onPress?: () => void
  onPressIn?: () => void
  onChangeText: (value: string) => void
  __nativeTag?: number
  testID?: string
  horizontal?: boolean
  contentContainerStyle?: StyleProp<ViewStyle>
  'data-slot'?: string
}
type ReactTestInstance = { type: unknown; props: HostProps; children: (string | ReactTestInstance)[]; findAll: (predicate: (node: ReactTestInstance) => boolean) => ReactTestInstance[] }
type ReactTestRenderer = { root: ReactTestInstance; unmount: () => void; update: (element: React.ReactElement) => void }
const { act, create } = require('react-test-renderer') as {
  act: { (callback: () => Promise<void>): Promise<void>; (callback: () => void): void }
  create: (element: React.ReactElement, options?: { createNodeMock: () => unknown }) => ReactTestRenderer
}
let tree: ReactTestRenderer
let animationDelay = 0
beforeEach(async () => {
  animationDelay = 0
  __resetTestHostConfig()
  vi.spyOn(Animated, 'timing').mockImplementation(() => {
    let frame: ReturnType<typeof setTimeout> | undefined
    return { start: callback => { frame = setTimeout(() => callback?.({ finished: true }), animationDelay) }, stop: () => clearTimeout(frame), reset: vi.fn() }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0))
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  act(() => tree.unmount())
  useChatStore.setState({ messages: [] })
  useChatStore.getState().setDraft('')
  useChatStore.getState().setContextualSuggestion(null)
  useUIStore.getState().setAstraConversationOpen(false)
  vi.restoreAllMocks()
})

function hosts() { return tree.root.findAll(node => typeof node.type === 'string') }
function button(label: string) { return hosts().find(node => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || text(node).includes(label)))! }
function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === 'string' ? child : text(child)).join('') }
function press(label: string) { act(() => { const target = button(label); (target.props.onPress ?? target.props.onPressIn)!() }) }
function search(query: string) { act(() => hosts().find(node => node.props.accessibilityLabel === 'Buscar ideias')!.props.onChangeText(query)) }
function library(options: Partial<Parameters<typeof PromptLibrary>[0]> = {}) {
  act(() => { tree = create(<PromptLibrary onBack={vi.fn()} onSelect={vi.fn()} suggestions={[]} hasProAccess hasGoogleConnection {...options} />) })
}

it('shows one category, searches across categories in Portuguese and clears a miss', () => {
  library()
  expect(button('Montar minha manhã')).toBeDefined()
  expect(button('Entender as proteções')).toBeUndefined()
  search('protecoes')
  expect(button('Entender as proteções')).toBeDefined()
  search('sem resultado')
  expect(text(tree.root)).toContain('Nenhuma ideia para “sem resultado”.')
  press('Limpar busca')
  expect(button('Montar minha manhã')).toBeDefined()
  const categories = hosts().find(node => node.props.testID === 'prompt-categories')!
  expect(categories.props.horizontal).toBe(true)
  expect(StyleSheet.flatten(categories.props.contentContainerStyle).flexWrap).toBe('nowrap')
})

it('paginates search results in groups of at most eight templates', () => {
  library()
  search('me ajude')
  const labels = hosts().filter(node => node.props['data-slot'] === 'list-row-title').map(text)
  expect(labels).toHaveLength(8)
  press('Mais ideias')
  expect(hosts().filter(node => node.props['data-slot'] === 'list-row-title').map(text)).not.toEqual(labels)
  expect(button('Ideias anteriores').props.accessibilityState.disabled).toBe(false)
})

it.each([[false, true], [true, false], [false, false]])('hides Calendar with Pro %s and Google %s', (hasProAccess, hasGoogleConnection) => {
  library({ hasProAccess, hasGoogleConnection })
  expect(button('Calendário')).toBeUndefined()
  search('Google')
  expect(button('Importar esta semana')).toBeUndefined()
})

it.each(['Limite diário atingido', 'Você está offline'])('disables template and live rows with reason %s', disabledReason => {
  const onSelect = vi.fn()
  const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0, profile: createMockProfile() })
  const suggestions = toComposerSuggestions(chips.map(chip => ({ id: chip.id, label: chip.key, onSelect })))
  library({ disabledReason, suggestions, onSelect })
  expect(text(tree.root)).toContain(disabledReason)
  for (const label of ['Montar minha manhã', ...suggestions.map(suggestion => suggestion.label)]) {
    expect(button(label).props.accessibilityState.disabled).toBe(true)
  }
})

it('uses the composer live rows and their activation, and omits an empty live section', () => {
  const select = vi.fn()
  const back = vi.fn()
  const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0, profile: createMockProfile() })
  const suggestions = toComposerSuggestions(chips.map(chip => ({ id: chip.id, label: chip.key, onSelect: select })))
  library({ suggestions, onBack: back })
  expect(hosts().filter(node => node.props['data-slot'] === 'list-row-title').slice(0, suggestions.length).map(text)).toEqual(suggestions.map(suggestion => suggestion.label))
  press(suggestions[0]!.label)
  expect(select).toHaveBeenCalledOnce()
  expect(back).toHaveBeenCalledOnce()
  act(() => tree.update(<PromptLibrary onBack={back} onSelect={vi.fn()} suggestions={[]} hasProAccess hasGoogleConnection />))
  expect(text(tree.root)).not.toContain('Para você agora')
})

function Harness({ send, blocked, recording = false }: Readonly<{ send: ReturnType<typeof vi.fn>; blocked?: 'offline' | 'atLimit'; recording?: boolean }>) {
  const value = useChatStore(store => store.draft)
  const messages = useChatStore(store => store.messages)
  const composerProps: ComposerProps = {
    ...(recording ? { state: 'recording' as const, onVoice: vi.fn(), voiceWords: { start: 'Iniciar', stop: 'Parar', recording: 'Gravando', transcribing: 'Transcrevendo' } } : { state: 'idle' as const }), value, onChangeValue: useChatStore.getState().setDraft, onSend: vi.fn(), suggestions: [],
    words: { placeholder: 'Pergunte', inputLabel: 'Mensagem', send: 'Enviar', actions: 'Anexar', suggestionsLabel: 'Sugestões' },
  }
  const chat = {
    threadScroll: createChatThreadScroll(), flatListRef: { current: null }, scrollToBottom: vi.fn(), messages, isOnline: blocked !== 'offline', atMessageLimit: blocked === 'atLimit', aiMessagesLimit: 5, activeSteps: [],
    isTyping: false, streamingMessageId: null, showSuggestions: messages.length === 0, canShowFollowUps: false, isSending: false,
    hasProAccess: true, hasGoogleConnection: true, sendMessage: send, composerProps,
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  return <AstraConversation chat={chat} />
}

it('opens from both entries, returns on Android back, and retains the draft', async () => {
  const accessibilityFocus = vi.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
  useChatStore.getState().setDraft('Minhas palavras')
  useUIStore.getState().setAstraConversationOpen(true)
  await act(() => { tree = create(<Harness send={vi.fn()} />); return Promise.resolve() })
  for (const entry of [0, 1]) {
    const triggers = hosts().filter(node => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === 'Ver ideias' || text(node) === 'Ver ideias'))
    act(() => { const target = triggers[entry]!; (target.props.onPress ?? target.props.onPressIn)!() })
    expect(hosts().some(node => node.props.testID === 'prompt-library')).toBe(true)
    expect(accessibilityFocus).toHaveBeenCalled()
    act(() => overlay.back())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(__getFocusedNativeTag()).toBe(triggers[entry]!.props.__nativeTag)
    expect(hosts().some(node => node.props.testID === 'prompt-library')).toBe(false)
    expect(useChatStore.getState().draft).toBe('Minhas palavras')
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
  }
})

it('selects the first editable slot and sends one complete prompt while retaining the draft', async () => {
  const send = vi.fn()
  await act(() => { tree = create(<Harness send={send} />); return Promise.resolve() })
  press('Ver ideias')
  press('Lembrar')
  press('Criar um lembrete')
  expect(useChatStore.getState().draft).toBe('Me lembre de {hábito} às {hora}.')
  expect(__getFocusedInputSelection()).toEqual({ start: 13, end: 21 })
  expect(send).not.toHaveBeenCalled()
  press('Ver ideias')
  press('Recomeçar')
  press('Voltar após uma semana')
  expect(send).toHaveBeenCalledExactlyOnceWith('Me ajude a recomeçar depois de uma semana difícil.')
  expect(useChatStore.getState().draft).toBe('Me lembre de {hábito} às {hora}.')
})

it('retains a slotted idea without replacing the draft', async () => {
  useChatStore.getState().setDraft('Meu rascunho')
  await act(() => { tree = create(<Harness send={vi.fn()} />); return Promise.resolve() })
  press('Ver ideias')
  press('Lembrar')
  press('Criar um lembrete')
  expect(useChatStore.getState().draft).toBe('Meu rascunho')
  expect(button('Criar um lembrete').props.accessibilityState.disabled).toBe(true)
  act(() => useChatStore.getState().setDraft(''))
  press('Criar um lembrete')
  expect(useChatStore.getState().draft).toBe('Me lembre de {hábito} às {hora}.')
})

it('returns focus to the header when sending removes the empty-thread trigger', async () => {
  const send = vi.fn((content: string) => useChatStore.getState().addMessage({ id: 'sent', role: 'user', content, timestamp: new Date() }))
  await act(() => { tree = create(<Harness send={send} />); return Promise.resolve() })
  const triggers = hosts().filter(node => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === 'Ver ideias' || text(node) === 'Ver ideias'))
  act(() => { const target = triggers[1]!; (target.props.onPress ?? target.props.onPressIn)!() })
  press('Montar minha manhã')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  expect(__getFocusedNativeTag()).toBe(triggers[0]!.props.__nativeTag)
  expect(send).toHaveBeenCalledOnce()
})

it.each(['offline', 'atLimit'] as const)('keeps ideas disabled at %s even while recording masks the composer state', async blocked => {
  await act(() => { tree = create(<Harness send={vi.fn()} blocked={blocked} recording />); return Promise.resolve() })
  press('Ver ideias')
  expect(button('Montar minha manhã').props.accessibilityState.disabled).toBe(true)
  expect(hosts().some(node => node.props.testID === 'capacity-notice')).toBe(true)
})

it('refocuses the heading when reopened during the native exit', async () => {
  animationDelay = 100
  const accessibilityFocus = vi.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
  await act(() => { tree = create(<Harness send={vi.fn()} />); return Promise.resolve() })
  press('Ver ideias')
  act(() => overlay.back())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  accessibilityFocus.mockClear()
  press('Ver ideias')
  const heading = hosts().find(node => node.props.accessibilityRole === 'header' && text(node) === 'Ideias')!
  expect(accessibilityFocus).toHaveBeenCalledWith(expect.objectContaining({ __nativeTag: heading.props.__nativeTag }), 'focus')
})
