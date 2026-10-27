import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { afterEach, expect, it, vi } from 'vitest'
import { AccessibilityInfo, StyleSheet, Text, type TextStyle } from 'react-native'
import type { ComponentProps } from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { questionBlockFixture as block, questionAnswersFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction, QuestionBlockProps } from '@orbit/shared/chat'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { QuestionBlock } from '@/components/chat/question-block'
import { Input } from '@/components/ui/input'
import { IconButton } from '@/components/ui/icon-button'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type NativeNode = ReactTestInstance & { props: {
  accessibilityLabel?: string
  accessibilityState: { checked: boolean; disabled?: boolean }
  accessibilityValue: { now: number; text: string }
  onPress: () => void
  onLayout: (event: { nativeEvent: { layout: { width: number } } }) => void
  onResponderGrant: (event: { nativeEvent: { locationX: number } }) => void
  onResponderMove: (event: { nativeEvent: { locationX: number } }) => void
  onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => void
  onKeyDown: (event: { nativeEvent: { key: string } }) => void
} }
let tree: ReactTestRenderer & { toJSON: () => unknown; unmount: () => void }
const interaction = (overrides: Partial<BlockAnswerInteraction> = {}): BlockAnswerInteraction => ({ isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(() => Promise.resolve({ ok: true as const })), ...overrides })
async function mount(props: Partial<QuestionBlockProps> = {}) { await renderer.act(() => { tree = renderer.create(<QuestionBlock block={block} interaction={interaction()} {...props} />) as typeof tree }) }
function roles(role: string) { return tree.root.findAll(node => typeof node.type === 'string' && (node.props.accessibilityRole === role || node.props.role === role)) as NativeNode[] }
const text = () => JSON.stringify(tree.toJSON())
const inputs = () => tree.root.findAll(node => node.type === Input) as (ReactTestInstance & { props: ComponentProps<typeof Input> })[]
const button = () => (tree.root.findAll(node => node.type === IconButton)[0]! as ReactTestInstance & { props: ComponentProps<typeof IconButton> })
async function press(node: ReactTestInstance) { await renderer.act(() => (node.props.onPress as () => void)()) }
async function submit() { await renderer.act(async () => { button().props.onClick?.(); await Promise.resolve() }) }
async function complete() {
  await press(roles('radio').find(node => node.props.accessibilityLabel?.startsWith('Morning'))!)
  await press(roles('checkbox').find(node => node.props.accessibilityLabel === 'Walking')!)
  await press(roles('checkbox').find(node => node.props.accessibilityLabel === 'Reading')!)
  await renderer.act(() => inputs()[1]!.props.onChange('Swimming'))
  await press(roles('radio').find(node => node.props.accessibilityLabel === '3')!)
  await renderer.act(() => roles('slider')[0]!.props.onLayout({ nativeEvent: { layout: { width: 248 } } }))
  await renderer.act(() => roles('slider')[0]!.props.onResponderGrant({ nativeEvent: { locationX: 124 } }))
  await press(roles('radio').find(node => node.props.accessibilityLabel?.startsWith(en.common.no))!)
}
afterEach(async () => { await renderer.act(() => tree.unmount()); await i18n.changeLanguage('en'); __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }); vi.restoreAllMocks() })

it.each(['en', 'pt-BR'])('renders all five Android question types and localized progress in %s', async locale => {
  await i18n.changeLanguage(locale)
  await mount()
  expect(roles('radio')).toHaveLength(9)
  expect(roles('radio').every(node => !node.props.accessibilityState.checked)).toBe(true)
  expect(roles('checkbox')).toHaveLength(2)
  expect(roles('slider')).toHaveLength(1)
  expect(text()).toContain(locale === 'en' ? '0 of 5 questions answered' : '0 de 5 perguntas respondidas')
  expect(text()).toContain(locale === 'en' ? en.chat.placement.recommended : pt.chat.placement.recommended)
  expect(text()).toContain('Low')
  expect(text()).toContain('High')
})
it('shows each required hint, focuses the first missing question and makes no request', async () => {
  const focus = vi.spyOn(AccessibilityInfo, 'setAccessibilityFocus')
  const context = interaction()
  await mount({ interaction: context })
  await submit()
  expect(tree.root.findAll(node => node.type === Text).filter(node => node.props.children === en.chat.question.required)).toHaveLength(5)
  expect(context.send).not.toHaveBeenCalled()
  expect(focus).toHaveBeenCalled()
})
it('submits every typed value once, including false and zero, and locks with chosen answers', async () => {
  const context = interaction()
  await mount({ interaction: context })
  await complete()
  expect(text()).toContain('5 of 5 questions answered')
  await submit()
  expect(context.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'question', answer: { blockId: block.blockId, selectedIds: [], answers: questionAnswersFixture } }))
  expect(roles('slider')).toHaveLength(0)
  expect(text()).toContain('Add a reminder?: No')
})
it('uses primitive accessibility adjustments, native keyboard input and touch dragging on decimal steps', async () => {
  await mount()
  await renderer.act(() => roles('slider')[0]!.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
  expect(roles('slider')[0]!.props.accessibilityValue).toMatchObject({ now: -0.2, text: '-0.2 hours' })
  await renderer.act(() => roles('slider')[0]!.props.onKeyDown({ nativeEvent: { key: 'ArrowLeft' } }))
  expect(roles('slider')[0]!.props.accessibilityValue.now).toBeCloseTo(-0.3)
  await renderer.act(() => roles('slider')[0]!.props.onLayout({ nativeEvent: { layout: { width: 248 } } }))
  await renderer.act(() => roles('slider')[0]!.props.onResponderMove({ nativeEvent: { locationX: 224 } }))
  expect(roles('slider')[0]!.props.accessibilityValue.now).toBeCloseTo(0.3)
})
it('keeps custom text, replaces single and yes/no answers and combines multiple choice and text', async () => {
  await mount()
  await complete()
  await renderer.act(() => inputs()[0]!.props.onChange('After work '))
  expect(inputs()[0]!.props.value).toBe('After work ')
  expect(roles('radio').filter(node => node.props.accessibilityLabel?.startsWith('Morning'))[0]!.props.accessibilityState.checked).toBe(false)
  await renderer.act(() => inputs()[2]!.props.onChange('Ask me later'))
  expect(roles('radio').filter(node => node.props.accessibilityLabel?.startsWith(en.common.no))[0]!.props.accessibilityState.checked).toBe(false)
})
it('disables all controls during submission and retains answers after a recoverable error', async () => {
  let finish!: (value: { ok: false; status: number }) => void
  const context = interaction({ send: vi.fn<BlockAnswerInteraction['send']>(() => new Promise(resolve => { finish = resolve })) })
  await mount({ interaction: context })
  await complete()
  await submit()
  await submit()
  expect(context.send).toHaveBeenCalledTimes(1)
  expect(inputs().every(input => input.props.disabled)).toBe(true)
  expect(roles('slider')[0]!.props.accessibilityState.disabled).toBe(true)
  await renderer.act(() => finish({ ok: false, status: 500 }))
  expect(text()).toContain(en.chat.choice.error)
  expect(text()).toContain('5 of 5 questions answered')
})
it.each(['offline', 'limit', 'expired', 'saved'] as const)('keeps the Android %s guard', async mode => {
  const context = interaction({ isOnline: mode !== 'offline', atMessageLimit: mode === 'limit' })
  await mount({ interaction: context, expired: mode === 'expired', savedAnswer: mode === 'saved' ? { text: 'Saved answers', answered: true } : undefined })
  if (mode === 'expired' || mode === 'saved') expect(tree.root.findAll(node => node.type === IconButton)).toHaveLength(0)
  else expect(button().props.disabled).toBe(true)
  expect(context.send).not.toHaveBeenCalled()
})
it('leaves supplied question text unclamped for large Android text', async () => {
  await mount()
  for (const node of tree.root.findAll(node => node.type === Text)) {
    const style = StyleSheet.flatten(node.props.style) as TextStyle
    if (!block.questions.some(question => question.prompt === node.props.children || (question.type === 'scale' && [question.lowLabel, question.highLabel].some(label => label === node.props.children)))) continue
    expect(node.props.numberOfLines).toBeUndefined()
    expect(style.overflow).not.toBe('hidden')
  }
})

it.each([320, 412].flatMap(width => ['en', 'pt-BR'].flatMap(locale => [1, 2].map(scale => ({ width, locale, scale })))))('fits Android question rows at $width and scale $scale in $locale', async ({ width, locale, scale }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
  await i18n.changeLanguage(locale)
  const label = locale === 'en' ? 'Making time for a routine after work and other responsibilities' : 'Encontrar tempo para uma rotina depois do trabalho e de outros compromissos'
  const supplied = { ...block, questions: block.questions.map(question => question.type === 'singleChoice' || question.type === 'multipleChoice' ? { ...question, options: question.options.map(option => ({ ...option, label: `${option.label}: ${label}` })) } : question) }
  await mount({ block: supplied })
  const layout = measureProfileRow(tree.toJSON() as Parameters<typeof measureProfileRow>[0], width - 32, scale)
  const labels = supplied.questions.flatMap(question => question.type === 'singleChoice' || question.type === 'multipleChoice' ? question.options.map(option => option.label) : [])
  for (const label of labels) {
    const text = layout.texts.find(text => text.label === label)!
    expect(text, label).toBeDefined()
    expect(text.clipped, label).toBe(false)
    expect(text.right, label).toBeLessThanOrEqual(width - 32 + 1)
    expect(text.left, label).toBeGreaterThanOrEqual(0)
  }
})
