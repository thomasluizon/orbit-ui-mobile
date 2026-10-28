import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import { makeHeldHabitMessage, makeOneSmallStepCard } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/message-bubble'
import { i18n } from '@/lib/i18n'

vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => React.createElement('Markdown', null, children) }))
vi.unmock('react-i18next')
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
let tree: ReactTestRenderer & { toJSON: () => unknown; unmount: () => void }
const buttons = (name: string) => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === name)
async function mount(locale: 'en' | 'pt-BR' = 'en', blocked = false, long = false) {
  await i18n.changeLanguage(locale)
  const card = makeOneSmallStepCard(locale)
  if (long) { card.suggestion.goal = 'Read a very long book '.repeat(8).trim(); card.suggestion.step = 'Open the first page of the book '.repeat(6).trim() }
  const send = vi.fn(async (_message: string) => {})
  const message = makeHeldHabitMessage({ content: '', pendingOperations: [], parts: [{ type: 'block', kind: 'oneSmallStep', block: card }] })
  await renderer.act(() => { tree = renderer.create(<MessageBubble message={message} onSendMessage={send} blockAnswerInteraction={{ isOnline: !blocked, isSending: false, atMessageLimit: false, allowance: 10, send: vi.fn() }} />) as typeof tree })
  return { card, send }
}
afterEach(async () => { await renderer.act(() => tree.unmount()); await i18n.changeLanguage('en') })

describe('one small step on Android', () => {
  it.each(['en', 'pt-BR'] as const)('renders the goal, step and server-labelled actions in %s', async locale => {
    const { card } = await mount(locale)
    const content = JSON.stringify(tree.toJSON())
    expect(content).toContain(card.suggestion.goal)
    expect(content).toContain(card.suggestion.step)
    for (const action of card.actions) expect(buttons(action.label)).toHaveLength(1)
  })
  it.each([0, 1, 2])('submits action %s once through chat without a record write', async index => {
    const { card, send } = await mount()
    await renderer.act(() => { (buttons(card.actions[index]!.label)[0]!.props.onPress as () => void)() })
    expect(send).toHaveBeenCalledExactlyOnceWith(card.actions[index]!.message)
    expect(buttons('Approve')).toHaveLength(0)
  })
  it('disables every action while offline', async () => {
    const { card, send } = await mount('en', true)
    for (const action of card.actions) expect(buttons(action.label)[0]!.props.accessibilityState).toMatchObject({ disabled: true })
    expect(send).not.toHaveBeenCalled()
  })
  it('discloses overflowing goal and step text through the shared text controls', async () => {
    const { card } = await mount('en', false, true)
    const probes = tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.onTextLayout === 'function')
    for (const probe of probes) {
      const words = String(probe.props.children).split(' ')
      const lines = [words.slice(0, 3).join(' ') + ' ', words.slice(3, 6).join(' ') + ' ', words.slice(6).join(' ')]
      await renderer.act(() => { (probe.props.onTextLayout as (event: unknown) => void)({ nativeEvent: { lines: lines.map(text => ({ text })) } }) })
    }
    for (const text of [card.suggestion.goal, card.suggestion.step]) {
      const name = text === card.suggestion.goal ? i18n.t('common.showFullText', { name: text }) : text
      const button = buttons(name)[0]!
      expect(button.props.accessibilityState).toMatchObject({ expanded: false })
      await renderer.act(() => { (button.props.onPress as () => void)() })
      expect(buttons(name)[0]!.props.accessibilityState).toMatchObject({ expanded: true })
    }
  })
  it('retains replies without the block', async () => {
    await renderer.act(() => { tree = renderer.create(<MessageBubble message={makeHeldHabitMessage({ content: 'Open the book.', pendingOperations: [] })} />) as typeof tree })
    expect(JSON.stringify(tree.toJSON())).toContain('Open the book.')
    expect(buttons('Smaller')).toHaveLength(0)
  })
})
