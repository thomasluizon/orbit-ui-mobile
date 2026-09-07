import type { ReactElement } from 'react'
import { StyleSheet } from 'react-native'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { DateRow } from '@/components/ui/date-row'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { createTokensV2 } from '@/lib/theme'

const focus = vi.hoisted(() => vi.fn())
vi.mock('react-native', async (importActual) => {
  const actual = await importActual<typeof import('react-native')>()
  const React = await import('react')
  return { ...actual, TextInput: React.forwardRef((props: Record<string, unknown>, ref) => {
    React.useImperativeHandle(ref, () => ({ focus }))
    return React.createElement('TextInput', props)
  }) }
})

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { uses24HourClock: true } }),
}))

interface TestNode {
  readonly type: unknown
  readonly props: Readonly<Record<string, unknown>>
  find(predicate: (node: TestNode) => boolean): TestNode
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  findAllByType(type: string): TestNode[]
}

interface TestTree {
  readonly root: TestNode
  update(element: ReactElement): void
}

function render(element: ReactElement): TestTree {
  let tree: TestTree | undefined
  void act(() => {
    tree = create(element) as unknown as TestTree
  })
  if (tree == null) throw new Error('Form primitive test renderer did not mount')
  return tree
}

function prop<T>(node: TestNode, name: string): T {
  return node.props[name] as T
}

const fireEvent = {
  changeText(node: TestNode, value: string) {
    void act(() => prop<(nextValue: string) => void>(node, 'onChangeText')(value))
  },
}

function byRole(root: TestNode, role: string): TestNode[] {
  return root.findAll((node) => prop(node, 'accessibilityRole') === role)
}

function textValues(root: TestNode): unknown[] {
  return root.findAllByType('Text').map((node) => prop(node, 'children'))
}

describe('form primitives on mobile', () => {
  it('focuses only on an explicit request and preserves email keyboard settings', () => {
    focus.mockClear()
    const props = { label: 'Email', value: 'invalid', onChange: vi.fn(), kind: 'email' as const, autoComplete: 'email' as const }
    const tree = render(<Input {...props} focusRequest={0} />)
    expect(focus).not.toHaveBeenCalled()
    void act(() => tree.update(<Input {...props} error="Invalid email" focusRequest={1} />))
    expect(focus).toHaveBeenCalledTimes(1)
    void act(() => tree.update(<Input {...props} value="editing" error="Still invalid" focusRequest={1} />))
    expect(focus).toHaveBeenCalledTimes(1)
    void act(() => tree.update(<Input {...props} error="Still invalid" focusRequest={2} />))
    expect(focus).toHaveBeenCalledTimes(2)
    const input = tree.root.findAllByType('TextInput')[0]!
    expect(input.props).toMatchObject({ keyboardType: 'email-address', autoComplete: 'email', autoCorrect: false, autoCapitalize: 'none' })
  })

  it.each([undefined, 'Invalid email'])('distinguishes input focus while preserving error=%s', (error) => {
    const tokens = createTokensV2('purple', 'dark')
    const tree = render(<Input label="Email" value="invalid" onChange={vi.fn()} error={error} />)
    const input = tree.root.findAllByType('TextInput')[0]!
    const style = () => StyleSheet.flatten(prop(input, 'style'))
    const resting = style()
    void act(() => prop<(() => void) | undefined>(input, 'onFocus')?.())
    expect(style()).not.toEqual(resting)
    expect(style()).toMatchObject({ outlineWidth: 2, outlineColor: tokens.primary })
    if (error) expect(style()).toMatchObject({ borderColor: tokens.statusBad })
    void act(() => prop<() => void>(input, 'onBlur')())
    expect(style()).toEqual(resting)
  })

  it.each([undefined, 'Wrong code'])('distinguishes OTP focus entering and leaving with error=%s', (error) => {
    const tokens = createTokensV2('purple', 'dark')
    const tree = render(<OtpInput label="Code" value="12" onChange={vi.fn()} autoFocus={false} error={error} />)
    const input = tree.root.findAllByType('TextInput')[0]!
    const cell = () => tree.root.find((node) => node.type === 'View' && node.props.testID === 'otp-cell-2')
    expect(cell().props['data-active']).toBeUndefined()
    void act(() => prop<(() => void) | undefined>(input, 'onFocus')?.())
    expect(cell().props['data-active']).toBe('')
    expect(StyleSheet.flatten(prop(cell(), 'style'))).toMatchObject({ outlineWidth: 2, outlineColor: tokens.primary })
    if (error) expect(StyleSheet.flatten(prop(cell(), 'style'))).toMatchObject({ borderColor: tokens.statusBad })
    void act(() => prop<() => void>(input, 'onBlur')())
    expect(cell().props['data-active']).toBeUndefined()
    expect(StyleSheet.flatten(prop(cell(), 'style'))).toMatchObject({ outlineWidth: 0 })
  })

  it('renders labelled single and multiline inputs with their shared limits', () => {
    const onChange = vi.fn()
    const tree = render(
      <Input label="Habit name" value="Walk" onChange={onChange} maxLength={60} />,
    )
    const input = tree.root.findAllByType('TextInput')[0]!
    expect(prop(input, 'accessibilityLabel')).toBe('Habit name')
    expect(prop(input, 'maxLength')).toBe(60)
    prop<(value: string) => void>(input, 'onChangeText')('Walk outside')
    expect(onChange).toHaveBeenCalledWith('Walk outside')

    void act(() => {
      tree.update(
        <Input
          label="Description"
          value="One line"
          onChange={onChange}
          multiline
          rows={4}
          maxLength={120}
        />,
      )
    })
    const textarea = tree.root.findAllByType('TextInput')[0]!
    expect(prop(textarea, 'multiline')).toBe(true)
    expect(prop(textarea, 'numberOfLines')).toBe(4)
    expect(prop(textarea, 'maxLength')).toBe(120)

    void act(() => {
      tree.update(
        <Input
          label="Amount"
          value="1.5"
          onChange={onChange}
          inputMode="decimal"
        />,
      )
    })
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'keyboardType')).toBe('decimal-pad')
  })

  it('uses the mono face for monospaced input values', () => {
    const tree = render(<Input label="Time" value="07:45" onChange={vi.fn()} mono />)
    const input = tree.root.findAllByType('TextInput')[0]!

    expect(StyleSheet.flatten(prop(input, 'style'))).toMatchObject({
      fontFamily: 'GeistMono_400Regular',
    })
  })

  it('uses one real OTP input with platform autofill and six painted cells', () => {
    const onChange = vi.fn()
    const tree = render(
      <OtpInput label="Verification code" value="12" onChange={onChange} error="Wrong code" />,
    )
    const inputs = tree.root.findAllByType('TextInput')
    expect(inputs).toHaveLength(1)
    expect(prop(inputs[0]!, 'textContentType')).toBe('oneTimeCode')
    expect(prop(inputs[0]!, 'autoComplete')).toBe('sms-otp')
    expect(textValues(tree.root).filter((value) => value === 'Wrong code')).toHaveLength(1)
    prop<(value: string) => void>(inputs[0]!, 'onChangeText')('123 456')
    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('keeps Checkbox interactive or paint only and neutral when checked', () => {
    const onChange = vi.fn()
    const tree = render(<Checkbox checked onChange={onChange} label="Done" />)
    const control = byRole(tree.root, 'checkbox')[0]!
    prop<() => void>(control, 'onPress')()
    expect(onChange).toHaveBeenCalledWith(false)

    void act(() => {
      tree.update(<Checkbox checked={false} onChange={onChange} as="span" />)
    })
    expect(byRole(tree.root, 'checkbox')).toHaveLength(0)
  })

  it('makes the full CheckRow the one control and replaces its description with an error', () => {
    const onChange = vi.fn()
    const tree = render(
      <CheckRow
        label="Drink water"
        checked={false}
        onChange={onChange}
        description="Before lunch"
        error="Choose a time"
        value={2}
      />,
    )
    const control = byRole(tree.root, 'checkbox')[0]!
    prop<() => void>(control, 'onPress')()
    expect(onChange).toHaveBeenCalledWith(true)
    const paintedCheckbox = tree.root.find((node) => node.type === Checkbox)
    expect(prop(paintedCheckbox, 'as')).toBe('span')
    expect(textValues(tree.root)).toContain('Choose a time')
    expect(textValues(tree.root)).not.toContain('Before lunch')
    expect(textValues(tree.root)).toContain(2)
  })

  it('reports Switch state and passes the next state', () => {
    const onChange = vi.fn()
    const tree = render(<Switch label="Reminders" checked={false} onChange={onChange} />)
    const control = byRole(tree.root, 'switch')[0]!
    expect(prop(control, 'accessibilityState')).toEqual({ checked: false })
    prop<() => void>(control, 'onPress')()
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('inserts the h23 separator during fresh numeric-keypad entry', () => {
    const onChange = vi.fn()
    const tree = render(
      <TimeField label="Exact time" value="" onChange={onChange} hourCycle="h23" />,
    )
    let input = tree.root.findAllByType('TextInput')[0]!

    expect(prop(input, 'keyboardType')).toBe('number-pad')
    fireEvent.changeText(input, '1')
    input = tree.root.findAllByType('TextInput')[0]!
    expect(prop(input, 'value')).toBe('1')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.changeText(input, '19')
    input = tree.root.findAllByType('TextInput')[0]!
    expect(prop(input, 'value')).toBe('19:')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.changeText(input, '19:3')
    input = tree.root.findAllByType('TextInput')[0]!
    expect(prop(input, 'value')).toBe('19:3')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.changeText(input, '19:30')
    input = tree.root.findAllByType('TextInput')[0]!
    expect(prop(input, 'value')).toBe('19:30')
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('19:30')

    fireEvent.changeText(input, '19:')
    input = tree.root.findAllByType('TextInput')[0]!
    fireEvent.changeText(input, '19')
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'value')).toBe('1')
  })

  it('accepts typed and pasted h23 separators without emitting invalid values', () => {
    const onChange = vi.fn()
    const tree = render(
      <TimeField label="Exact time" value="" onChange={onChange} hourCycle="h23" />,
    )
    let input = tree.root.findAllByType('TextInput')[0]!

    fireEvent.changeText(input, '19')
    input = tree.root.findAllByType('TextInput')[0]!
    fireEvent.changeText(input, '19::')
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'value')).toBe('19:')

    input = tree.root.findAllByType('TextInput')[0]!
    fireEvent.changeText(input, '0745')
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'value')).toBe('07:45')
    expect(onChange).toHaveBeenLastCalledWith('07:45')

    input = tree.root.findAllByType('TextInput')[0]!
    fireEvent.changeText(input, '29:30')
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'value')).toBe('29:30')
    expect(onChange).not.toHaveBeenCalledWith('29:30')
  })

  it('presents 12 hour time while returning a 24 hour wire value', () => {
    const onChange = vi.fn()
    const tree = render(
      <TimeField label="Exact time" value="19:30" onChange={onChange} hourCycle="h12" />,
    )
    const input = tree.root.findAllByType('TextInput')[0]!
    expect(prop(input, 'value')).toBe('7:30 pm')
    expect(prop(input, 'keyboardType')).toBe('default')
    prop<(value: string) => void>(input, 'onChangeText')('9:15 am')
    expect(onChange).toHaveBeenCalledWith('09:15')

    void act(() => prop<() => void>(input, 'onFocus')())
    void act(() => prop<(value: string) => void>(input, 'onChangeText')('10:'))
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'value')).toBe('10:')
    void act(() => prop<() => void>(tree.root.findAllByType('TextInput')[0]!, 'onBlur')())
    expect(prop(tree.root.findAllByType('TextInput')[0]!, 'value')).toBe('7:30 pm')
  })

  it('renders DateRow only as formatted text with its fixed-date note', () => {
    const tree = render(
      <DateRow
        label="Start date"
        value="Aug 28, 2026"
        note="The start date does not change."
      />,
    )
    expect(textValues(tree.root)).toContain('Aug 28, 2026')
    expect(textValues(tree.root)).toContain('The start date does not change.')
    expect(byRole(tree.root, 'button')).toHaveLength(0)
  })
})
