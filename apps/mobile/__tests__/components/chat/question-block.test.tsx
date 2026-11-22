import { __setWindowDimensions } from '@/test-mocks/react-native'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import { afterEach, expect, it, vi } from 'vitest'
import { AccessibilityInfo, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
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
import { createTokensV2, getRuntimeTheme } from '@/lib/theme'

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
function selectionRingOf(option: ReactTestInstance) {
  return option.findAll(node => typeof node.type === 'string' && node.props.testID === 'selection-ring')[0]!
}
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
