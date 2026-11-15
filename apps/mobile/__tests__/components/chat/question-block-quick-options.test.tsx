import { afterEach, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { questionBlockFixture as block } from '@orbit/shared/test-support/chat-fixtures'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
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
  expect(prompts()).toEqual(expect.arrayContaining(['Which activities?', 'How much energy?', 'How long?', 'Add a reminder?']))
})
