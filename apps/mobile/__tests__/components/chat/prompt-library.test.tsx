import React from 'react'
import { createRequire, Module } from 'node:module'
import type { GestureStateChangeEvent, HoverGesture } from 'react-native-gesture-handler'
import * as ReactNative from 'react-native'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccessibilityInfo, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { buildComposerChips } from '@orbit/shared/chat'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PROMPT_TEMPLATES, PROMPT_PRESENTATION } from '@orbit/shared/chat/prompt-library'
import { CatalogIdea, PromptIdea } from '@/components/chat/prompt-idea'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { PromptLibrary } from '@/components/chat/prompt-library'
import { AstraConversation } from '@/components/chat/conversation'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { i18n } from '@/lib/i18n'
import { createTokensV2, shadows } from '@/lib/theme'
import { __focusHost, __getFocusedInputSelection, __getFocusedNativeTag, __resetTestHostConfig, __setTouchMode } from '@/test-mocks/react-native'

const appearance = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({ currentScheme: 'orange', currentTheme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ ...appearance, shadows }) }))

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
  children?: React.ReactNode
  accessibilityRole?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityState: { disabled: boolean }
  onPress?: () => void
  onPressIn?: () => void
  onPressOut?: () => void
  onChangeText: (value: string) => void
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  collapsable?: boolean
  gesture?: HoverGesture
  __nativeTag?: number
  testID?: string
  horizontal?: boolean
  contentContainerStyle?: StyleProp<ViewStyle>
  'data-slot'?: string
}
type ReactTestInstance = { type: unknown; props: HostProps; parent: ReactTestInstance | null; children: (string | ReactTestInstance)[]; findAll: (predicate: (node: ReactTestInstance) => boolean) => ReactTestInstance[] }
type ReactTestRenderer = { toJSON: () => Parameters<typeof measureProfileRow>[0]; root: ReactTestInstance; unmount: () => void; update: (element: React.ReactElement) => void }
const { act, create } = require('react-test-renderer') as {
  act: { (callback: () => Promise<void>): Promise<void>; (callback: () => void): void }
  create: (element: React.ReactElement, options?: { createNodeMock: () => unknown }) => ReactTestRenderer
}
let tree: ReactTestRenderer
let animationDelay = 0
beforeEach(async () => {
  animationDelay = 0
  appearance.currentTheme = 'dark'
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
function ideaActions() { return hosts().filter(node => node.props.testID === 'prompt-live-idea' || node.props.testID?.startsWith('prompt-idea:')) }
function button(label: string) { return hosts().find(node => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || text(node).includes(label)))! }
function text(node: ReactTestInstance): string { return node.children.map(child => typeof child === 'string' ? child : text(child)).join('') }
function press(label: string) { act(() => { const target = button(label); (target.props.onPress ?? target.props.onPressIn)!() }) }
function search(query: string) { act(() => hosts().find(node => node.props.accessibilityLabel === 'Buscar ideias')!.props.onChangeText(query)) }
function library(options: Partial<Parameters<typeof PromptLibrary>[0]> = {}) {
  act(() => { tree = create(<PromptLibrary onBack={vi.fn()} onSelect={vi.fn()} suggestions={[]} hasProAccess hasGoogleConnection {...options} />) })
}

const loadGestureModule = createRequire(import.meta.url)
const { HoverGesture: InstalledHoverGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/hoverGesture') as { HoverGesture: new () => HoverGesture }
const { findHandler } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/handlersRegistry') as { findHandler: (tag: number) => HoverGesture | undefined }
const { State } = loadGestureModule('react-native-gesture-handler/lib/commonjs/State') as typeof import('react-native-gesture-handler/lib/typescript/State')
const { PointerType } = loadGestureModule('react-native-gesture-handler/lib/commonjs/PointerType') as typeof import('react-native-gesture-handler/lib/typescript/PointerType')

function loadInstalledReceiver() {
  const nativePath = loadGestureModule.resolve('react-native')
  const previous = loadGestureModule.cache[nativePath]
  const nativeModule = new Module(nativePath)
  nativeModule.exports = ReactNative
  loadGestureModule.cache[nativePath] = nativeModule
  try {
    return loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/eventReceiver') as {
      onGestureHandlerEvent: (event: GestureStateChangeEvent) => void
    }
  } finally {
    if (previous) loadGestureModule.cache[nativePath] = previous
    else delete loadGestureModule.cache[nativePath]
  }
}
const { onGestureHandlerEvent } = loadInstalledReceiver()

function attachedIdeaHover(target: ReactTestInstance): HoverGesture {
  let detector = target.parent
  while (detector && typeof detector.type !== 'string') detector = detector.parent
  expect(detector?.type, 'the native hover detector must wrap the full Ideas action').toBe('GestureDetector')
  const child = React.Children.only(detector!.props.children) as React.ReactElement<{ testID?: string; collapsable?: boolean }>
  expect(child.type, 'hover must attach to the existing focus and press owner').toBe(InsetFocusPressable)
  expect(child.props.testID).toBe(target.props.testID)
  expect(child.props.collapsable).toBe(false)
  expect(target.props.collapsable).toBe(false)
  const gesture = detector!.props.gesture!
  expect(gesture).toBeInstanceOf(InstalledHoverGesture)
  expect(gesture.handlerName).toBe('HoverGestureHandler')
  expect(gesture.config).toEqual({ manualActivation: true, cancelsTouchesInView: false, runOnJS: true, enabled: !target.props.accessibilityState.disabled })
  expect(gesture.handlerTag).toBeGreaterThan(0)
  expect(findHandler(gesture.handlerTag)).toBe(gesture)
  expect(gesture.shouldUseReanimated).toBe(false)
  return gesture
}

function deliverHover(gesture: HoverGesture, state: typeof State[keyof typeof State], oldState: typeof State[keyof typeof State]) {
  act(() => onGestureHandlerEvent({
    handlerTag: gesture.handlerTag, numberOfPointers: 1, pointerType: PointerType.MOUSE,
    x: 24, y: 16, absoluteX: 72, absoluteY: 32, state, oldState,
  }))
}

function actionStyle(target: ReactTestInstance, pressed = false) {
  if (!target.props.style) return {}
  return StyleSheet.flatten(typeof target.props.style === 'function' ? target.props.style({ pressed }) : target.props.style)
}

function focusAction(target: ReactTestInstance) {
  act(() => { __setTouchMode(false); __focusHost(target.props.__nativeTag!) })
}

function focusRings(target: ReactTestInstance) {
  return target.findAll(node => typeof node.type === 'string' && actionStyle(node).outlineWidth === 2)
}

function liveSuggestions(onSelect: () => void) {
  const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0, profile: createMockProfile() })
  return toComposerSuggestions(chips.map(chip => ({ id: chip.id, label: i18n.t(chip.key), onSelect })))
}

const hoverAppearances = [['en', 'dark'], ['en', 'light'], ['pt-BR', 'dark'], ['pt-BR', 'light']] as const

it.each(hoverAppearances)('attaches native hover to every full Ideas action in %s %s', async (locale, mode) => {
  await i18n.changeLanguage(locale)
  appearance.currentTheme = mode
  const onSelect = vi.fn()
  const onBack = vi.fn()
  library({ suggestions: liveSuggestions(onSelect), onSelect, onBack })
  const actions = ideaActions()
  const gestures = actions.map(attachedIdeaHover)
  expect(new Set(gestures.map(gesture => gesture.handlerTag)).size).toBe(actions.length)
  expect(hosts().filter(node => node.type === 'GestureDetector')).toHaveLength(actions.length)
  const resting = actions.map(target => actionStyle(target))
  for (const [index, target] of actions.entries()) {
    expect(resting[index]).toMatchObject({ minHeight: 48, padding: 16, borderRadius: 20, overflow: 'hidden', gap: 12 })
    for (const finalState of [State.END, State.FAILED, State.CANCELLED]) {
      deliverHover(gestures[index]!, State.BEGAN, State.UNDETERMINED)
      expect(actionStyle(target), 'native receiver entry must paint the full action').toEqual({ ...resting[index], backgroundColor: createTokensV2('orange', mode).bgHover })
      expect(attachedIdeaHover(target)).toBe(gestures[index])
      expect(focusRings(target)).toHaveLength(0)
      actions.forEach((other, otherIndex) => { if (other !== target) expect(actionStyle(other)).toEqual(resting[otherIndex]) })
      deliverHover(gestures[index]!, finalState, State.BEGAN)
      expect(actionStyle(target), 'every native hover finalization must clear the fill').toEqual(resting[index])
    }
  }
  expect(onSelect).not.toHaveBeenCalled()
  expect(onBack).not.toHaveBeenCalled()
})

function expectIndependentFeedback(target: ReactTestInstance, back: ReactTestInstance, hoverFill: string) {
  const gesture = attachedIdeaHover(target)
  const resting = actionStyle(target)
  const feedback = { ...resting, backgroundColor: hoverFill }
  focusAction(target)
  expect(focusRings(target)).toHaveLength(1)
  expect(actionStyle(focusRings(target)[0]!)).toMatchObject({ borderRadius: 20, outlineOffset: -4, outlineWidth: 2 })
  deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
  act(() => target.props.onPressIn!())
  deliverHover(gesture, State.END, State.BEGAN)
  expect(actionStyle(target, true)).toEqual(feedback)
  expect(focusRings(target)).toHaveLength(1)
  act(() => target.props.onPressOut!())
  expect(actionStyle(target)).toEqual(feedback)
  focusAction(back)
  expect(actionStyle(target)).toEqual(resting)
  expect(focusRings(target)).toHaveLength(0)
  deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
  focusAction(target)
  focusAction(back)
  act(() => target.props.onPressIn!())
  act(() => target.props.onPressOut!())
  expect(actionStyle(target)).toEqual(feedback)
  expect(focusRings(target)).toHaveLength(0)
  deliverHover(gesture, State.CANCELLED, State.BEGAN)
  expect(actionStyle(target)).toEqual(resting)
  act(() => target.props.onPressIn!())
  deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
  deliverHover(gesture, State.FAILED, State.BEGAN)
  expect(actionStyle(target, true)).toEqual(feedback)
  act(() => target.props.onPressOut!())
  expect(actionStyle(target)).toEqual(resting)
}

it.each(hoverAppearances)('keeps native hover independent of press and focus in %s %s', async (locale, mode) => {
  await i18n.changeLanguage(locale)
  appearance.currentTheme = mode
  const onSelect = vi.fn()
  const onBack = vi.fn()
  library({ suggestions: liveSuggestions(onSelect), onSelect, onBack })
  const back = button(i18n.t('chat.templates.back'))
  const actions = ideaActions()
  for (const target of [actions[0]!, actions.at(-1)!]) {
    expectIndependentFeedback(target, back, createTokensV2('orange', mode).bgHover)
  }
  expect(onSelect).not.toHaveBeenCalled()
  expect(onBack).not.toHaveBeenCalled()
})

it.each(hoverAppearances)('clears native hover across disabled Ideas transitions in %s %s', async (locale, mode) => {
  await i18n.changeLanguage(locale)
  appearance.currentTheme = mode
  const onSelect = vi.fn()
  const onBack = vi.fn()
  const suggestions = liveSuggestions(onSelect)
  const view = (disabled: boolean) => <PromptLibrary suggestions={suggestions} onSelect={onSelect} onBack={onBack} disabledReason={disabled ? i18n.t('shell.composer.offline.reason') : undefined} hasProAccess hasGoogleConnection />
  act(() => { tree = create(view(false)) })
  const resting = ideaActions().map(target => actionStyle(target))
  const enabledGestures = ideaActions().map(attachedIdeaHover)
  for (const gesture of enabledGestures) deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
  act(() => tree.update(view(true)))
  for (const gesture of enabledGestures) expect(findHandler(gesture.handlerTag)).toBeUndefined()
  const disabledGestures = ideaActions().map(attachedIdeaHover)
  ideaActions().forEach((target, index) => {
    deliverHover(disabledGestures[index]!, State.BEGAN, State.UNDETERMINED)
    focusAction(target)
    expect(actionStyle(target)).toEqual({ ...resting[index], opacity: 0.5 })
    expect(focusRings(target)).toHaveLength(0)
    act(() => target.props.onPress!())
  })
  act(() => tree.update(view(false)))
  for (const gesture of disabledGestures) {
    expect(findHandler(gesture.handlerTag)).toBeUndefined()
    deliverHover(gesture, State.CANCELLED, State.BEGAN)
  }
  ideaActions().forEach((target, index) => {
    expect(actionStyle(target), 'reenabling must not restore an old hover').toEqual(resting[index])
    const gesture = attachedIdeaHover(target)
    deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
    expect(actionStyle(target).backgroundColor).toBe(createTokensV2('orange', mode).bgHover)
    deliverHover(gesture, State.FAILED, State.BEGAN)
    expect(actionStyle(target)).toEqual(resting[index])
  })
  expect(onSelect).not.toHaveBeenCalled()
  expect(onBack).not.toHaveBeenCalled()
})

it.each(hoverAppearances)('unregisters native Ideas hover before remount in %s %s', async (locale, mode) => {
  await i18n.changeLanguage(locale)
  appearance.currentTheme = mode
  const onSelect = vi.fn()
  const onBack = vi.fn()
  const view = <PromptLibrary suggestions={liveSuggestions(onSelect)} onSelect={onSelect} onBack={onBack} hasProAccess hasGoogleConnection />
  act(() => { tree = create(view) })
  const originalGestures = ideaActions().map(attachedIdeaHover)
  for (const gesture of originalGestures) deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
  act(() => tree.update(<View />))
  expect(ideaActions()).toHaveLength(0)
  for (const gesture of originalGestures) {
    expect(findHandler(gesture.handlerTag)).toBeUndefined()
    deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
  }
  act(() => tree.update(view))
  const actions = ideaActions()
  const currentGestures = actions.map(attachedIdeaHover)
  expect(currentGestures).toHaveLength(originalGestures.length)
  for (const [index, target] of actions.entries()) {
    const gesture = currentGestures[index]!
    expect(originalGestures.map(original => original.handlerTag)).not.toContain(gesture.handlerTag)
    const resting = actionStyle(target)
    deliverHover(originalGestures[index]!, State.BEGAN, State.UNDETERMINED)
    expect(actionStyle(target)).toEqual(resting)
    deliverHover(gesture, State.BEGAN, State.UNDETERMINED)
    deliverHover(originalGestures[index]!, State.END, State.BEGAN)
    expect(actionStyle(target)).toEqual({ ...resting, backgroundColor: createTokensV2('orange', mode).bgHover })
    deliverHover(gesture, State.END, State.BEGAN)
    expect(actionStyle(target)).toEqual(resting)
  }
  expect(onSelect).not.toHaveBeenCalled()
  expect(onBack).not.toHaveBeenCalled()
})

it('shows one category, searches across categories in Portuguese and clears a miss', () => {
  library()
  expect(button('Montar minha manhã')).toBeDefined()
  expect(button('Entender os congelamentos')).toBeUndefined()
  search('congelamentos da sequencia')
  expect(button('Entender os congelamentos')).toBeDefined()
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
  const labels = hosts().filter(node => node.props['data-slot'] === 'prompt-idea-title').map(text)
  expect(labels).toHaveLength(8)
  press('Mais ideias')
  expect(hosts().filter(node => node.props['data-slot'] === 'prompt-idea-title').map(text)).not.toEqual(labels)
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
  expect(hosts().filter(node => node.props['data-slot'] === 'prompt-idea-title').slice(0, suggestions.length).map(text)).toEqual(suggestions.map(suggestion => suggestion.label))
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
    words: { placeholder: 'Pergunte', inputLabel: 'Mensagem', send: 'Enviar', paste: 'Colar', nothingToPaste: 'Nada para colar', clear: 'Limpar mensagem', actions: 'Anexar', suggestionsLabel: 'Sugestões' },
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
  press('Voltar após semana difícil')
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

it.each(['en', 'pt-BR'] as const)('keeps all approved native examples, single targets and exact callback prompts in %s', async locale => {
  await i18n.changeLanguage(locale)
  const onSelect = vi.fn()
  act(() => { tree = create(<View style={{ gap: 12 }}>{PROMPT_TEMPLATES.map(template => <CatalogIdea key={template.id} template={template} disabled={false} onSelect={onSelect} />)}</View>) })
  expect(hosts().filter(node => node.props.testID === 'prompt-example')).toHaveLength(12)
  expect(hosts().filter(node => node.props.accessibilityRole === 'button')).toHaveLength(36)
  for (const template of PROMPT_TEMPLATES) {
    const label = i18n.t(template.labelKey)
    const prompt = i18n.t(template.promptKey)
    const target = button(label)
    attachedIdeaHover(target)
    const example = target.findAll(node => node.props.testID === 'prompt-example')[0]
    expect(example ? text(example) : undefined).toBe(PROMPT_PRESENTATION[template.id].example ? prompt : undefined)
    const description = PROMPT_PRESENTATION[template.id].example ? prompt : undefined
    expect(target.props.accessibilityLabel).toBe(label)
    expect(target.props.accessibilityHint).toBe(description || undefined)
    expect(target.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button')).toHaveLength(1)
    expect(target.props.accessibilityState.disabled).toBe(false)
    expect(target.findAll(node => typeof node.type === 'string' && node.props.testID === 'prompt-attribution')).toHaveLength(0)
    press(label)
    expect(onSelect).toHaveBeenLastCalledWith(template.id, label, prompt)
  }
  expect(onSelect).toHaveBeenCalledTimes(36)
  expectNativeCardGeometry()
})

it.each(['en', 'pt-BR'] as const)('describes native request and preparation actions with and without examples in %s', async locale => {
  await i18n.changeLanguage(locale)
  const label = i18n.t('chat.templates.items.goalHabits.label')
  const prompt = i18n.t('chat.templates.items.goalHabits.prompt')
  const onSelect = vi.fn()
  act(() => { tree = create(<View />) })
  for (const example of [prompt, undefined]) {
    const view = (disabled: boolean) => <PromptIdea label={label} example={example} disabled={disabled} onSelect={onSelect} />
    act(() => tree.update(view(false)))
    const target = button(label)
    expect(hosts().filter(node => node.props.accessibilityRole === 'button')).toHaveLength(1)
    expect(target.props.accessibilityLabel).toBe(label)
    expect(target.props.accessibilityHint).toBe(example)
    expect(target.props.accessibilityState.disabled).toBe(false)
    onSelect.mockClear()
    press(label)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith()
    act(() => tree.update(view(true)))
    expect(button(label).props.accessibilityState.disabled).toBe(true)
    press(label)
    expect(onSelect).toHaveBeenCalledOnce()
  }
})

it.each(['en', 'pt-BR'] as const)('describes actual live request callbacks and keeps their disabled guard in %s', async locale => {
  await i18n.changeLanguage(locale)
  const onSelect = vi.fn()
  const onBack = vi.fn()
  const chips = buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0, profile: createMockProfile() })
  const suggestions = toComposerSuggestions(chips.map(chip => ({ id: chip.id, label: i18n.t(chip.key), onSelect })))
  library({ suggestions, onBack })
  const live = hosts().filter(node => node.props.testID === 'prompt-live-idea')
  expect(live).toHaveLength(suggestions.length)
  for (const suggestion of suggestions) {
    const target = button(suggestion.label)
    expect(target.props.accessibilityLabel).toBe(suggestion.label)
    expect(target.props.accessibilityHint).toBeUndefined()
    expect(target.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button')).toHaveLength(1)
  }
  press(suggestions[0]!.label)
  expect(onSelect).toHaveBeenCalledExactlyOnceWith()
  expect(onBack).toHaveBeenCalledOnce()
  act(() => tree.update(<PromptLibrary suggestions={suggestions} onBack={onBack} onSelect={vi.fn()} disabledReason={i18n.t('shell.composer.offline.reason')} hasProAccess hasGoogleConnection />))
  for (const suggestion of suggestions) expect(button(suggestion.label).props.accessibilityState.disabled).toBe(true)
  press(suggestions[1]!.label)
  expect(onSelect).toHaveBeenCalledOnce()
  expect(onBack).toHaveBeenCalledOnce()
})

it('hides live suggestions for a query, restores them on clear and browses without activation', () => {
  const select = vi.fn()
  const suggestions = toComposerSuggestions([{ id: 'one', label: 'Primeira sugestão', icon: <View testID="supplied-live-icon" />, onSelect: select }, { id: 'two', label: 'Segunda sugestão', onSelect: select }])
  library({ suggestions, onSelect: select })
  expect(hosts().some(node => node.props.testID === 'supplied-live-icon')).toBe(true)
  press('Lembrar')
  search('sem resultado')
  expect(button('Primeira sugestão')).toBeUndefined()
  expect(text(tree.root)).not.toContain('Para você agora')
  press('Limpar busca')
  expect(button('Primeira sugestão')).toBeDefined()
  expect(button('Criar um lembrete')).toBeDefined()
  expect(select).not.toHaveBeenCalled()
})

it('guards repeated activation, exiting actions and stale callbacks after unmount', () => {
  const select = vi.fn()
  library({ onSelect: select })
  const action = button('Montar minha manhã').props.onPress!
  act(() => { action(); action() })
  expect(select).toHaveBeenCalledTimes(1)
  act(() => tree.update(<PromptLibrary visible={false} onBack={vi.fn()} onSelect={select} suggestions={[]} hasProAccess hasGoogleConnection />))
  act(() => action())
  expect(select).toHaveBeenCalledTimes(1)
  act(() => tree.update(<PromptLibrary visible onBack={vi.fn()} onSelect={select} suggestions={[]} hasProAccess hasGoogleConnection />))
  press('Montar minha manhã')
  expect(select).toHaveBeenCalledTimes(2)
  act(() => tree.update(<View />))
  act(() => action())
  expect(select).toHaveBeenCalledTimes(2)
})

function expectNativeCardGeometry() {
  for (const width of [320, 360, 384, 412, 1352]) {
    for (const scale of [1, 2]) {
      const layout = measureProfileRow(tree.toJSON(), Math.min(width, 740) - 32, scale)
      expect(layout.controls).toHaveLength(36)
      for (const control of layout.controls) {
        expect(control.height).toBeGreaterThanOrEqual(48)
        expect(control.inlineClearance).toBeGreaterThanOrEqual(16)
      }
      const titles = layout.parts.filter(part => part.slot === 'prompt-idea-title')
      expect(titles).toHaveLength(36)
      for (const template of PROMPT_TEMPLATES) {
        const title = layout.texts.find(item => item.label === i18n.t(template.labelKey))!
        expect(title.clipped).toBe(false)
        if (scale === 1) expect(title.lines, template.id).toBe(1)
      }
    }
  }
}

it('uses the app heading type, shared search field and a persistent category scroll cue', () => {
  library()
  const heading = hosts().find(node => node.props.accessibilityRole === 'header' && text(node) === 'Ideias')!
  expect(actionStyle(heading)).toMatchObject({ fontFamily: 'Geist_500Medium', fontSize: 22 })
  const search = hosts().find(node => node.props.accessibilityLabel === 'Buscar ideias')!
  expect(search.props).toMatchObject({ placeholder: 'Buscar ideias' })
  expect(actionStyle(search)).toMatchObject({ minHeight: 54, paddingHorizontal: 16 })
  expect(hosts().filter(node => typeof node.type === 'string' && text(node) === 'Buscar ideias')).toHaveLength(0)
  const categories = hosts().find(node => node.props.testID === 'prompt-categories')!
  expect(categories.props).toMatchObject({ horizontal: true, persistentScrollbar: true, showsHorizontalScrollIndicator: true })
})

it('gives live and catalog ideas the same neutral row without fallback icons or attribution', () => {
  const tokens = createTokensV2('orange', 'dark')
  library({ suggestions: liveSuggestions(vi.fn()) })
  expect(hosts().filter(node => node.props.testID === 'prompt-attribution')).toHaveLength(0)
  for (const row of ideaActions()) expect(actionStyle(row).backgroundColor).toBe(tokens.bgCard)
  const live = ideaActions().filter(node => node.props.testID === 'prompt-live-idea')
  for (const row of live) expect(row.findAll(node => typeof node.type === 'string' && node.props.testID === 'prompt-intent')).toHaveLength(0)
})
