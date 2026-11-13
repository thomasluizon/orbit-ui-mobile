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

it('renders the single-choice and yes or no questions as quick options and selects the pressed one', async () => {
  enableTestFlags('orbit_guided_flows')
  await mount()
  const morning = optionCards().find(card => /Morning/.test(card.props.accessibilityLabel))!
  expect(morning).toBeDefined()
  await renderer.act(() => morning.props.onPress())
  const selected = optionCards().filter(card => card.props.accessibilityState.selected)
  expect(selected).toHaveLength(1)
  expect(selected[0]!.props.accessibilityLabel).toMatch(/Morning/)
})

it('keeps the radio list while the flag is off', async () => {
  await mount()
  expect(optionCards()).toHaveLength(0)
})
