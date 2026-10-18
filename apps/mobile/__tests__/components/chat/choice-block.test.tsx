import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo, StyleSheet, type StyleProp, type TextStyle } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { controlContrast } from '@orbit/shared/__tests__/contrast'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { choiceBlockFixture, pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'
import { ArrowUp } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'
import { Input } from '@/components/ui/input'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
const words = pt.chat.choice
let tree: ReactTestRenderer & { toJSON: () => unknown; unmount: () => void }
function interaction(overrides: Partial<BlockAnswerInteraction> = {}): BlockAnswerInteraction {
  return { isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(() => Promise.resolve({ ok: true as const })), ...overrides }
}
function choice(context = interaction(), multiSelect = false, expired = false) {
  return <ChoiceBlock block={{ ...choiceBlockFixture, multiSelect }} interaction={context} expired={expired} />
}
function roles(role: string): ReactTestInstance[] {
  return tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === role)
}
function rowTexts(control: ReactTestInstance): ReactTestInstance[] {
  const row = tree.root.findAll(node => typeof node.type === 'string' && node.props['data-slot'] === 'list-row-body' && node.findAll(child => child === control).length > 0)[0]!
  return row.findAll(node => String(node.type) === 'Text' && (StyleSheet.flatten(node.props.style as StyleProp<TextStyle>) as TextStyle | undefined)?.opacity !== 0)
}
async function mount(element: React.ReactElement) { await renderer.act(() => { tree = renderer.create(element) as typeof tree }) }
async function press(node: ReactTestInstance) { await renderer.act(async () => { (node.props.onPress as () => void)(); await Promise.resolve() }) }
const button = () => tree.root.findAll(node => node.type === Button)[0]!.props as unknown as React.ComponentProps<typeof Button>
const input = () => tree.root.findAll(node => node.type === Input)[0]!.props as unknown as React.ComponentProps<typeof Input>
const state = (node: ReactTestInstance) => node.props.accessibilityState as { checked: boolean; disabled?: boolean }
async function submit() { await renderer.act(async () => { button().onClick?.(); await Promise.resolve() }) }
const content = () => JSON.stringify(tree.toJSON())
beforeEach(async () => { await i18n.changeLanguage('pt-BR') })
afterEach(async () => { await renderer.act(() => tree.unmount()); await i18n.changeLanguage('en') })

describe('Android choice and pick list answers', () => {
  it('exposes a radiogroup, checked state and position without sending on selection', async () => {
    const context = interaction()
    await mount(choice(context))
    expect(roles('radiogroup')).toHaveLength(1)
    const radios = roles('radio')
    expect(radios).toHaveLength(3)
    expect(radios[2]!.props.accessibilityLabel).toContain('3 de 3')
    await press(radios[2]!)
    expect(state(roles('radio')[2]!).checked).toBe(true)
    expect(context.send).not.toHaveBeenCalled()
    const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
    await submit()
    expect(context.send).toHaveBeenCalledExactlyOnceWith({ kind: 'choice', answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: [choiceBlockFixture.options[2]!.label] })
    expect(content()).toContain(`Você escolheu ${choiceBlockFixture.options[2]!.label}`)
    expect(roles('radiogroup')).toHaveLength(0)
    expect(focus).toHaveBeenCalled()
    focus.mockRestore()
  })
  it('keeps separate checkboxes and requires at least one selection even with free text', async () => {
    const context = interaction()
    await mount(choice(context, true))
    expect(button().disabled).toBe(true)
    await renderer.act(() => input().onChange('Outro horário'))
    expect(button().disabled).toBe(true)
    await press(roles('checkbox')[0]!)
    await press(roles('checkbox')[2]!)
    await submit()
    expect(content()).toContain(`${choiceBlockFixture.options[0]!.label}, ${choiceBlockFixture.options[2]!.label} e Outro horário`)
    expect(context.send).toHaveBeenCalledWith(expect.objectContaining({ answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['morning', 'evening'], freeText: 'Outro horário' } }))
  })
  it('disables all controls together and ignores double submission', async () => {
    let finish!: (value: { ok: true }) => void
    const send = vi.fn(() => new Promise<{ ok: true }>(resolve => { finish = resolve }))
    await mount(choice(interaction({ send })))
    await press(roles('radio')[0]!)
    await submit()
    expect(button().disabled).toBe(true)
    expect(input().disabled).toBe(true)
    expect(roles('radio').every(row => state(row).disabled)).toBe(true)
    await submit()
    expect(send).toHaveBeenCalledTimes(1)
    await renderer.act(() => finish({ ok: true }))
  })
  it.each([404, 409, 410, 400, 500])('handles server status %s inside the block', async status => {
    await mount(choice(interaction({ send: vi.fn(() => Promise.resolve({ ok: false, status })) })))
    await press(roles('radio')[0]!)
    await submit()
    if (status === 400 || status === 500) {
      expect(content()).toContain(status === 400 ? words.invalid : words.error)
      expect(state(roles('radio')[0]!).checked).toBe(true)
      expect(button().disabled).toBe(false)
    } else expect(content()).toContain(status === 409 ? words.alreadyAnswered : words.closed)
  })
  it('closes when a later message exists and announces through focus', async () => {
    const context = interaction()
    await mount(choice(context))
    await renderer.act(() => tree.update(choice(context, false, true)))
    expect(content()).toContain(words.closed)
    expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')).toHaveLength(0)
    expect(roles('radio')).toHaveLength(0)
  })
  it('keeps the offline selection and disables a choice at quota', async () => {
    const context = interaction()
    await mount(choice(context))
    await press(roles('radio')[1]!)
    await renderer.act(() => tree.update(choice({ ...context, isOnline: false })))
    expect(content()).toContain(words.offline)
    expect(state(roles('radio')[1]!).checked).toBe(true)
    expect(button().disabled).toBe(true)
    await renderer.act(() => tree.update(choice({ ...context, atMessageLimit: true })))
    expect(content()).toContain('Você usou suas 5 mensagens de hoje.')
    expect(button().disabled).toBe(true)
  })
  it('reviews exactly the selected proposed items at quota', async () => {
    const context = interaction({ atMessageLimit: true })
    await mount(<PickListBlock block={pickListBlockFixture} interaction={context} />)
    const proposedRows = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'proposed-row')
    expect(proposedRows()).toHaveLength(4)
    await press(roles('checkbox')[0]!)
    await press(roles('checkbox')[2]!)
    expect(proposedRows()).toHaveLength(2)
    expect(button().disabled).toBe(false)
    await submit()
    expect(context.send).toHaveBeenCalledExactlyOnceWith({ kind: 'pickList', answer: { blockId: pickListBlockFixture.blockId, selectedIds: ['1', '3'] }, labels: [pickListBlockFixture.items[0]!.label, pickListBlockFixture.items[2]!.label] })
  })
  it('labels and caps a free answer', async () => {
    const context = interaction()
    await mount(choice(context))
    expect(input().maxLength).toBe(500)
    expect(input().label).toBe(words.freeText)
    await renderer.act(() => input().onChange('Outro horário'))
    await submit()
    expect(context.send).toHaveBeenCalledWith(expect.objectContaining({ answer: { blockId: choiceBlockFixture.blockId, selectedIds: [], freeText: 'Outro horário' } }))
  })
})

it('keeps proposed label and detail legible while pressed', async () => {
  await mount(<PickListBlock block={pickListBlockFixture} interaction={interaction()} />)
  await renderer.act(() => { (roles('checkbox')[0]!.props.onPressIn as () => void)() })
  const tokens = createTokensV2()
  const texts = rowTexts(roles('checkbox')[0]!)
  expect(texts).toHaveLength(2)
  for (const text of texts) {
    const style = StyleSheet.flatten(text.props.style) as { color: string }
    expect(controlContrast(style.color, tokens.bgHover, [tokens.bg, tokens.bgCard]).graphic).toBeGreaterThanOrEqual(4.5)
  }
})

it.each(['single', 'multi', 'pickList'])('announces one acting reason outside Android %s controls', async kind => {
  let finish!: (value: { ok: true }) => void
  const context = interaction({ send: vi.fn(() => new Promise<{ ok: true }>(resolve => { finish = resolve })) })
  await mount(kind === 'pickList' ? <PickListBlock block={pickListBlockFixture} interaction={context} /> : choice(context, kind === 'multi'))
  await press(roles(kind === 'single' ? 'radio' : 'checkbox')[0]!)
  await submit()
  const live = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')
  expect(live).toHaveLength(1)
  expect(live[0]!.findAll(node => ['radio', 'checkbox', 'button'].includes(node.props.accessibilityRole as string))).toHaveLength(0)
  expect(live[0]!.props.children).toBe(kind === 'pickList' ? 'Preparando a prévia' : words.acting)
  await renderer.act(() => finish({ ok: true }))
  expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion === 'polite')).toHaveLength(0)
})

it('keeps checked selection text distinct from completed habit text', async () => {
  const { CheckRow } = await import('@/components/ui/check-row')
  await mount(<><PickListBlock block={pickListBlockFixture} interaction={interaction()} /><CheckRow label="Completed habit" checked onChange={vi.fn()} /></>)
  const color = (row: ReactTestInstance) => (StyleSheet.flatten(rowTexts(row)[0]!.props.style) as TextStyle).color
  const tokens = createTokensV2()
  expect(color(roles('checkbox')[0]!)).toBe(tokens.fg2)
  await press(roles('checkbox')[0]!)
  expect(color(roles('checkbox')[0]!)).toBe(tokens.fg1)
  expect(color(roles('checkbox').at(-1)!)).toBe(tokens.fg3)
})

it.each([false, true])('keeps the action glyph on the control foreground, disabled %s', async disabled => {
  const tokens = createTokensV2()
  await mount(<Button variant="secondary" disabled={disabled} leadingIcon={<ArrowUp color={tokens.fg1} />}>{words.submit}</Button>)
  const icon = tree.root.findAll(node => node.type === ArrowUp)[0]!
  const label = tree.root.findAll(node => String(node.type) === 'Text' && node.props.children === words.submit)[0]!
  const foreground = (StyleSheet.flatten(label.props.style) as TextStyle).color
  expect(icon.props.color).toBe(foreground)
})

it.each(['offline', 'limit'])('shows the current Android %s reason after failure', async reason => {
  const context = interaction({ send: vi.fn(() => Promise.resolve({ ok: false, status: 500 })) })
  await mount(choice(context))
  await press(roles('radio')[0]!)
  await submit()
  expect(content()).toContain(words.error)
  await renderer.act(() => tree.update(choice({ ...context, isOnline: reason !== 'offline', atMessageLimit: reason === 'limit' })))
  expect(content()).toContain(reason === 'offline' ? words.offline : 'Você usou suas 5 mensagens de hoje.')
  expect(roles('alert')).toHaveLength(0)
})

it('opens a full Android pick-list habit name before selecting it', async () => {
  await mount(<PickListBlock block={pickListBlockFixture} interaction={interaction()} />)
  const label = pickListBlockFixture.items[0]!.label
  const disclosure = () => roles('button').find(row => row.props.accessibilityLabel === label)!
  expect(disclosure()).toBeDefined()
  await press(disclosure())
  expect((disclosure().props.accessibilityState as { expanded: boolean }).expanded).toBe(true)
  expect(state(roles('checkbox')[0]!).checked).toBe(false)
})
