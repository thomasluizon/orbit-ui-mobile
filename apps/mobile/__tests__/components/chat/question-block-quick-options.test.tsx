import { afterEach, expect, it, vi } from 'vitest'
import * as ReactNative from 'react-native'
import { AccessibilityInfo, StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { questionBlockFixture as block } from '@orbit/shared/test-support/chat-fixtures'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { QuestionBlock } from '@/components/chat/question-block'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
let tree: (ReactTestRenderer & { unmount: () => void }) | undefined
afterEach(() => tree?.unmount())
const interaction = (): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(() => Promise.resolve({ ok: true as const })) })
async function mount() { await renderer.act(() => { tree = renderer.create(<QuestionBlock block={block} interaction={interaction()} />) }) }
const optionCards = () => tree!.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'option-card') as (ReactTestInstance & { props: { accessibilityLabel: string; accessibilityState: { selected: boolean }; onPress: () => void } })[]

const control = (label: string) => tree!.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0] as (ReactTestInstance & { props: { onPress: () => void; disabled?: boolean } }) | undefined
const prompts = () => tree!.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header').map(node => node.props.children as string)
const texts = () => tree!.root.findAll(node => typeof node.type === 'string' && typeof node.props.children === 'string').map(node => node.props.children as string)

it('renders the single-choice and yes or no questions as quick options, moves on after a press, and keeps the answer on the way back', async () => {
  enableTestFlags('orbit_guided_flows')
  await mount()
  const morning = optionCards().find(card => /Morning/.test(card.props.accessibilityLabel))!
  expect(morning).toBeDefined()
  await renderer.act(() => morning.props.onPress())
  expect(prompts()).toContain('Which activities?')
  expect(optionCards().some(card => /Morning/.test(card.props.accessibilityLabel))).toBe(false)
  await renderer.act(() => control('chat.question.previous')!.props.onPress())
  const selected = optionCards().filter(card => card.props.accessibilityState.selected)
  expect(selected).toHaveLength(1)
  expect(selected[0]!.props.accessibilityLabel).toMatch(/Morning/)
})

it('shows one question in view with its position and moves with the previous and next controls', async () => {
  enableTestFlags('orbit_guided_flows')
  await mount()
  expect(tree!.root.findAll(node => node.props.testID === 'question-in-view').length).toBeGreaterThan(0)
  expect(texts().filter(text => text === 'chat.choice.position')).toHaveLength(2)
  expect(texts()).not.toContain('chat.question.progress')
  expect(control('chat.question.previous')!.props.disabled).toBe(true)
  expect(texts()).toContain('When?')
  await renderer.act(() => control('chat.question.next')!.props.onPress())
  expect(prompts()).toEqual(['Which activities?'])
  expect(texts()).not.toContain('When?')
})

it('keeps the radio list and every question in view while the flag is off', async () => {
  await mount()
  expect(optionCards()).toHaveLength(0)
  expect(control('chat.question.next')).toBeUndefined()
  expect(texts()).toContain('chat.question.progress')
  expect(prompts()).toEqual(expect.arrayContaining(['Which activities?', 'How much energy?', 'How long?', 'Add a reminder?']))
})

it('sets the recommended note under the quick options in the type of the Recommended line of the row layout', async () => {
  enableTestFlags('orbit_guided_flows')
  await mount()
  const note = tree!.root.findAll(node => typeof node.type === 'string' && typeof node.props.children === 'string' && /: chat\.placement\.recommended$/.test(node.props.children))[0]!
  expect(StyleSheet.flatten(note.props.style as StyleProp<TextStyle>)).toMatchObject({ fontSize: 14, lineHeight: 19.6 })
})

it('moves screen reader focus to the new question after a quick option answer advances, and announces the position', async () => {
  enableTestFlags('orbit_guided_flows')
  const findNode = vi.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(42)
  const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
  try {
    await mount()
    expect(focus).not.toHaveBeenCalled()
    const navigation = tree!.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'question-in-view')[0]!
    const position = navigation.findAll(node => typeof node.type === 'string' && node.props.children === 'chat.choice.position')
    expect(position).toHaveLength(1)
    expect(position[0]!.props.accessibilityLiveRegion).toBe('polite')
    await renderer.act(() => optionCards().find(card => /Morning/.test(card.props.accessibilityLabel))!.props.onPress())
    expect(prompts()).toEqual(['Which activities?'])
    expect(focus).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenLastCalledWith(42)
    expect(findNode.mock.calls.at(-1)?.[0]).not.toBeNull()
  } finally { findNode.mockRestore(); focus.mockRestore() }
})

it('moves screen reader focus after the previous and the next control, and keeps it where it is while the flag is off', async () => {
  enableTestFlags('orbit_guided_flows')
  const findNode = vi.spyOn(ReactNative, 'findNodeHandle').mockReturnValue(42)
  const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {})
  try {
    await mount()
    await renderer.act(() => control('chat.question.next')!.props.onPress())
    expect(focus).toHaveBeenCalledTimes(1)
    await renderer.act(() => control('chat.question.previous')!.props.onPress())
    expect(focus).toHaveBeenCalledTimes(2)
    tree!.unmount()
    resetTestFlags()
    focus.mockClear()
    await mount()
    await renderer.act(async () => {})
    expect(focus).not.toHaveBeenCalled()
  } finally { findNode.mockRestore(); focus.mockRestore() }
})
