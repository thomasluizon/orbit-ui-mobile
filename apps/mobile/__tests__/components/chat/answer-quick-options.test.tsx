import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { choiceBlockFixture, pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'
import { IconButton } from '@/components/ui/icon-button'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
let tree: (ReactTestRenderer & { unmount: () => void }) | undefined
afterEach(async () => { await renderer.act(() => tree?.unmount()); tree = undefined })

type Kind = 'choice' | 'multi' | 'pick'
const plainChoice = { ...choiceBlockFixture, options: choiceBlockFixture.options.map(option => ({ ...option, description: null })) }
const SHORT_LABELS = ['Caminhar cedo', 'Beber água', 'Ler na pausa']
const longPickList = { ...pickListBlockFixture, items: pickListBlockFixture.items.slice(0, 3).map(item => ({ ...item, detail: null })) }
const plainPickList = { ...longPickList, items: longPickList.items.map((item, index) => ({ ...item, label: SHORT_LABELS[index]! })) }
const interaction = (): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(() => Promise.resolve({ ok: true as const })) })
const cards = () => tree!.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'option-card') as (ReactTestInstance & { props: { accessibilityLabel: string; accessibilityState: { selected: boolean }; onPress: () => void } })[]
const labelsOf = (kind: Kind) => kind === 'pick' ? plainPickList.items.map(item => item.label) : plainChoice.options.map(option => option.label)

async function mount(kind: Kind, send = interaction()) {
  await renderer.act(() => {
    tree = renderer.create(kind === 'pick' ? <PickListBlock block={plainPickList} interaction={send} /> : <ChoiceBlock block={{ ...plainChoice, multiSelect: kind === 'multi' }} interaction={send} />)
  })
  return send
}

async function pressNode(node: ReactTestInstance) { await renderer.act(async () => { (node.props.onPress as () => void)(); await Promise.resolve() }) }

async function answer(kind: Kind, quick: boolean) {
  const send = await mount(kind)
  const labels = labelsOf(kind)
  const control = (label: string) => quick
    ? cards().find(card => card.props.accessibilityLabel === label)!
    : tree!.root.findAll(node => typeof node.type === 'string' && typeof node.props.onPress === 'function' && (node.props.accessibilityRole === 'radio' || node.props.accessibilityRole === 'checkbox') && (node.props.accessibilityLabel === label || node.findAll(child => child.props.children === label).length > 0))[0]!
  await pressNode(control(labels[1]!))
  if (kind !== 'choice') await pressNode(control(labels[0]!))
  await renderer.act(async () => { (tree!.root.findAll(node => node.type === IconButton)[0]!.props as { onClick: () => void }).onClick(); await Promise.resolve() })
  await renderer.act(() => tree!.unmount())
  tree = undefined
  return (send.send as ReturnType<typeof vi.fn>).mock.calls
}

describe('the quick options of the Android conversation blocks', () => {

  it('keeps the list for a pick list whose labels hold more than 4 words', async () => {
    await renderer.act(() => { tree = renderer.create(<PickListBlock block={longPickList} interaction={interaction()} />) })
    expect(cards()).toHaveLength(0)
  })

  it('marks one pressed option of a single choice and toggles several of a multiple choice', async () => {
    await mount('choice')
    await pressNode(cards()[0]!)
    await pressNode(cards()[1]!)
    expect(cards().map(card => card.props.accessibilityState.selected)).toEqual([false, true, false])
    await renderer.act(() => tree!.unmount())
    await mount('multi')
    await pressNode(cards()[0]!)
    await pressNode(cards()[1]!)
    expect(cards().map(card => card.props.accessibilityState.selected)).toEqual([true, true, false])
  })
})

