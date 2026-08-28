import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OtpInput } from '@/components/ui/otp-input'

const TestRenderer = require('react-test-renderer')

describe('mobile OtpInput', () => {
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
