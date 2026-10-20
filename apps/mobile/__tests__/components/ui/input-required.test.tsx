import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from '@/components/ui/input'

const TestRenderer = require('react-test-renderer')

describe.each([false, true])('Input required state with multiline %s', (multiline) => {
  it.each([undefined, false, true])('renders required state %s on the control', async (required) => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(multiline
        ? <Input label="Message" value="" onChange={vi.fn()} required={required} multiline />
        : <Input label="Message" value="" onChange={vi.fn()} required={required} />)
      await Promise.resolve()
    })
    const control = tree!.root.findByType('TextInput')
    expect(control.props.accessibilityLabel).toBe('Message')
    expect(control.props.accessibilityHint).toBe(required ? 'common.required' : undefined)
    expect(control.props.editable).toBe(true)
  })

  it.each([false, true])('preserves errors and hints with required state %s when disabled', async (required) => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(multiline
        ? <Input label="Message" value="" onChange={vi.fn()} required={required} disabled error="Enter a message" hint="Your draft stays here" multiline />
        : <Input label="Message" value="" onChange={vi.fn()} required={required} disabled error="Enter a message" hint="Your draft stays here" />)
      await Promise.resolve()
    })
    const control = tree!.root.findByType('TextInput')
    expect(control.props.accessibilityHint).toBe(`${required ? 'common.required ' : ''}Enter a message Your draft stays here`)
    expect(control.props.accessibilityState).toEqual({ disabled: true })
    expect(control.props.editable).toBe(false)
    expect(tree!.root.findByType('TextInput').props.accessibilityLabel).toBe('Message')
  })
})
