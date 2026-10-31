import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import { afterEach, expect, it, vi } from 'vitest'
import { AccessibilityInfo, StyleSheet, Text, type TextStyle } from 'react-native'
import type { ComponentProps } from 'react'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { questionBlockFixture as block, questionAnswersFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction, QuestionBlockProps } from '@orbit/shared/chat'
import { questionBlockSchema } from '@orbit/shared/types/question-block'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
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
  expect(focus).toHaveBeenCalledTimes(1)
  await submit()
  expect(focus).toHaveBeenCalledTimes(2)
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
it.each(['keyboard', 'accessibility'])('steps an offset decimal slider in both directions using %s', async mode => {
  const supplied = questionBlockSchema.parse({ ...block, questions: [{ ...block.questions[3], min: 0.05, max: 0.25, step: 0.1 }] })
  await mount({ block: supplied })
  const expectValue = (value: number) => {
    expect(roles('slider')[0]!.props).toMatchObject({
      accessibilityValue: { min: 0.05, max: 0.25, now: value, text: `${value} hours` },
      'aria-valuenow': value, 'aria-valuemin': 0.05, 'aria-valuemax': 0.25,
    })
  }
  expectValue(0.05)
  for (const [increment, value] of [[true, 0.15], [true, 0.25], [true, 0.25], [false, 0.15], [false, 0.05], [false, 0.05]] as const) {
    await renderer.act(() => {
      const slider = roles('slider')[0]!
      if (mode === 'keyboard') slider.props.onKeyDown({ nativeEvent: { key: increment ? 'ArrowRight' : 'ArrowLeft' } })
      else slider.props.onAccessibilityAction({ nativeEvent: { actionName: increment ? 'increment' : 'decrement' } })
    })
    expectValue(value)
  }
})
it('formats Android slider limits, selection, announcements and submitted summary in pt-BR', async () => {
  await i18n.changeLanguage('pt-BR')
  const context = interaction()
  const supplied = questionBlockSchema.parse({ ...block, questions: [{ ...block.questions[3], min: 0.05, max: 0.25, step: 0.1 }] })
  await mount({ block: supplied, interaction: context })
  const labels = () => tree.root.findAll(node => node.type === Text).map(node => node.props.children)
  expect(labels()).toContain('0,05 hours / 0,25 hours')
  expect(roles('slider')[0]!.props.accessibilityValue.text).toBe('0,05 hours')
  await renderer.act(() => roles('slider')[0]!.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }))
  expect(labels()).toContain('0,15 hours')
  expect(roles('slider')[0]!.props.accessibilityValue).toMatchObject({ now: 0.15, text: '0,15 hours' })
  await submit()
  expect(context.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ labels: ['How long?: 0,15 hours'], answer: { blockId: block.blockId, selectedIds: [], answers: [{ questionId: 'duration', number: 0.15 }] } }))
  expect(roles('slider')).toHaveLength(0)
  expect(text()).toContain('How long?: 0,15 hours')
})
it.each(['pressed', 'focused', 'selected'] as const)('insets the Android scale paint inside its transparent target while %s', async state => {
  await mount()
  const scale = roles('radio').find(node => node.props.accessibilityLabel === '3')!
  if (state === 'selected') await press(scale)
  else if (state === 'pressed') await renderer.act(() => (scale.props.onPressIn as () => void)())
  else await renderer.act(() => (scale.props.onFocus as (event: { target: number; currentTarget: number }) => void)({ target: 1, currentTarget: 1 }))
  const parts = measureInteractionFills(tree.toJSON() as Parameters<typeof measureProfileRow>[0], 380, false)
  const target = parts.find(part => part.host.type === 'Pressable' && part.host.props.accessibilityLabel === '3')!
  const fill = parts.find(part => part.host.props['data-slot'] === 'question-scale-fill' && part.ancestors.includes(target.slot))!
  expect(target.style.backgroundColor).toBeUndefined()
  expect(target.style.outlineWidth).toBeUndefined()
  expect(target.style.borderWidth ?? 0).toBe(0)
  expect(fill.style).toMatchObject({ borderRadius: 12, overflow: 'hidden' })
  expect(fill.style.backgroundColor).not.toBe('transparent')
  if (state === 'selected') expect(fill.style.outlineWidth).toBe(2)
  if (state === 'focused') {
    const ring = parts.find(part => part.ancestors.includes(target.slot) && part.style.outlineWidth === 2)!
    expect(ring.left).toBe(fill.left)
    expect(ring.right).toBe(fill.right)
    expect(ring.top).toBe(fill.top)
    expect(ring.bottom).toBe(fill.bottom)
    expect(ring.style.outlineOffset).toBe(-2)
  }
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

it.each([320, 360, 384, 412, 600, 1024, 1352].flatMap(width => ['en', 'pt-BR'].flatMap(locale => [1, 2].map(scale => ({ width, locale, scale })))))('fits Android question rows at $width and scale $scale in $locale', async ({ width, locale, scale }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: scale })
  await i18n.changeLanguage(locale)
  const label = locale === 'en' ? 'Making time for a routine after work and other responsibilities' : 'Encontrar tempo para uma rotina depois do trabalho e de outros compromissos'
  const supplied = { ...block, questions: block.questions.map(question => question.type === 'singleChoice' || question.type === 'multipleChoice' ? { ...question, options: question.options.map(option => ({ ...option, label: `${option.label}: ${label}` })) } : question) }
  await mount({ block: supplied })
  const initial = measureProfileRow(tree.toJSON() as Parameters<typeof measureProfileRow>[0], width - 32, scale)
  const frame = initial.boxes.find(box => box.testID === 'question-scale')!
  const group = roles('radiogroup').find(node => node.props.testID === 'question-scale')!
  const layoutEvent = { nativeEvent: { layout: { x: frame.left, y: frame.top, width: frame.width, height: frame.height } } }
  await renderer.act(() => group.props.onLayout(layoutEvent))
  await press(roles('radio').find(node => node.props.accessibilityLabel === '2')!)
  await renderer.act(() => (roles('radio').find(node => node.props.accessibilityLabel === '3')!.props.onPressIn as () => void)())
  const layout = measureProfileRow(tree.toJSON() as Parameters<typeof measureProfileRow>[0], width - 32, scale)
  const scaleRows = layout.controls.filter(control => /^[1-5]$/.test(control.accessibilityLabel ?? ''))
  expect(scaleRows).toHaveLength(5)
  expect(new Set(scaleRows.map(row => row.top)).size, 'all five scale targets share one row').toBe(1)
  for (const [index, row] of scaleRows.entries()) {
    expect(row.width).toBeGreaterThanOrEqual(48)
    expect(row.height).toBeGreaterThanOrEqual(48)
    expect(row.width).toBeCloseTo(scaleRows[0]!.width, 1)
    expect(row.bottom).toBeCloseTo(scaleRows[0]!.bottom, 1)
    if (index > 0) expect(row.left, 'neighbouring scale targets touch').toBeCloseTo(scaleRows[index - 1]!.right, 1)
    expect(row.left).toBeGreaterThanOrEqual(0)
    expect(row.right).toBeLessThanOrEqual(width - 32 + 1)
  }
  const fills = layout.parts.filter(part => part.slot === 'question-scale-fill')
  expect(fills).toHaveLength(5)
  for (const [index, fill] of fills.entries()) {
    const row = scaleRows[index]!
    expect(fill.left - row.left).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    expect(row.right - fill.right).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    expect(fill.top - row.top).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    expect(row.bottom - fill.bottom).toBeCloseTo(INTERACTION_FILL_CLEARANCE / 2, 1)
    if (index > 0) expect(Number((fill.left - fills[index - 1]!.right).toFixed(3))).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
    if (index === 1 || index === 2) expect(fill.style.backgroundColor).not.toBe('transparent')
  }
  const labels = supplied.questions.flatMap(question => question.type === 'singleChoice' || question.type === 'multipleChoice' ? question.options.map(option => option.label) : [])
  for (const label of labels) {
    const text = layout.texts.find(text => text.label === label)!
    expect(text, label).toBeDefined()
    expect(text.clipped, label).toBe(false)
    expect(text.right, label).toBeLessThanOrEqual(width - 32 + 1)
    expect(text.left, label).toBeGreaterThanOrEqual(0)
  }
})
