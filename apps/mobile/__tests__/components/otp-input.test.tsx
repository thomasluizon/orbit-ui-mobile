import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Platform } from 'react-native'
import { OtpInput } from '@/components/ui/otp-input'

const TestRenderer = require('react-test-renderer')

describe('mobile OtpInput', () => {
  it('keeps one inset ring on the focused cell', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<OtpInput label="Code" value="" onChange={vi.fn()} error="Wrong code" />)
      await Promise.resolve()
    })
    TestRenderer.act(() => tree!.root.findByType('TextInput').props.onFocus())
    const activeCell = tree!.root.findByProps({ testID: 'otp-cell-0' })
    const ring = activeCell.props.style[1]
    expect(ring.borderWidth).toBe(2)
    expect(ring.outlineWidth ?? 0).toBe(0)
  })

  it('uses one spanning native input for whole-code paste and autofill', async () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    let tree: { root: { findAllByType: (type: string) => { props: Record<string, unknown> }[] } } | undefined

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <OtpInput
          label="Verification code"
          value=""
          onChange={onChange}
          onComplete={onComplete}
        />,
      )
      await Promise.resolve()
    })

    const inputs = tree!.root.findAllByType('TextInput')
    expect(inputs).toHaveLength(1)
    const input = inputs.at(0)
    if (!input) throw new Error('Expected the spanning OTP input')
    ;(input.props.onChangeText as (value: string) => void)('12 a34-567')
    expect(onChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it.each(['android', 'ios'] as const)('uses the supported %s hint without conflicting props', async (platform) => {
    const previous = Platform.OS
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
    let tree!: { root: { findAllByType: (type: string) => { props: Record<string, unknown> }[] }; unmount: () => void }
    try {
      await TestRenderer.act(() => { tree = TestRenderer.create(<OtpInput label="Code" value="" onChange={vi.fn()} />) })
      const input = tree.root.findAllByType('TextInput')[0]!
      expect(input.props.autoComplete).toBe(platform === 'android' ? 'email-otp' : undefined)
      expect(input.props.textContentType).toBe(platform === 'ios' ? 'oneTimeCode' : undefined)
      if (platform === 'android') {
        const require = createRequire(import.meta.url)
        const manager = readFileSync(join(dirname(require.resolve('react-native/package.json')), 'ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt'), 'utf8')
        expect(manager.includes('"email-otp" to HintConstants.AUTOFILL_HINT_EMAIL_OTP')).toBe(true)
      }
    } finally {
      await TestRenderer.act(() => tree.unmount())
      Object.defineProperty(Platform, 'OS', { configurable: true, value: previous })
    }
  })

  it('rings all six cells for a whole-code error', async () => {
    let tree: {
      root: { findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[] }
    } | undefined
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <OtpInput label="Verification code" value="123456" onChange={vi.fn()} error="Wrong code" />,
      )
      await Promise.resolve()
    })

    const cells = tree!.root.findAll((node) =>
      typeof node.props.testID === 'string' && node.props.testID.startsWith('otp-cell-'),
    )
    const cellsById = new Map(cells.map((cell) => [cell.props.testID, cell]))
    expect(cellsById.size).toBe(6)
    cellsById.forEach((cell) => {
      const errorStyle = (cell.props.style as Record<string, unknown>[]).at(1)
      expect(errorStyle?.borderWidth).toBe(2)
    })
  })
})
