import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { choiceBlockFixture, pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'
import { IconButton } from '@/components/ui/icon-button'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
let tree: (ReactTestRenderer & { unmount: () => void }) | undefined
afterEach(async () => { await renderer.act(() => tree?.unmount()); tree = undefined; resetTestFlags() })

type Kind = 'choice' | 'multi' | 'pick'
const plainChoice = { ...choiceBlockFixture, options: choiceBlockFixture.options.map(option => ({ ...option, description: null })) }
const plainPickList = { ...pickListBlockFixture, items: pickListBlockFixture.items.slice(0, 3).map(item => ({ ...item, detail: null })) }
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
  resetTestFlags()
  if (quick) enableTestFlags('orbit_guided_flows')
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
  it.each(['choice', 'multi', 'pick'] as const)('answers a %s block of 2 to 4 options with OptionCard and sends the payload the list sends', async (kind) => {
    enableTestFlags('orbit_guided_flows')
    await mount(kind)
    expect(cards().map(card => card.props.accessibilityLabel)).toEqual(labelsOf(kind))
    await renderer.act(() => tree!.unmount())
    tree = undefined
    const quick = await answer(kind, true)
    const list = await answer(kind, false)
    expect(quick).toHaveLength(1)
    expect(quick).toEqual(list)
  })

  it('keeps the list for an option with a detail line, and with the flag off', async () => {
    enableTestFlags('orbit_guided_flows')
    await renderer.act(() => { tree = renderer.create(<ChoiceBlock block={choiceBlockFixture} interaction={interaction()} />) })
    expect(cards()).toHaveLength(0)
    await renderer.act(() => tree!.unmount())
    resetTestFlags()
    await mount('choice')
    expect(cards()).toHaveLength(0)
  })

  it('marks one pressed option of a single choice and toggles several of a multiple choice', async () => {
    enableTestFlags('orbit_guided_flows')
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

