import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from '@/components/ui/switch'

const TestRenderer = require('react-test-renderer')

describe('Switch', () => {
  it('fires onChange with the next state when pressed', () => {
    const onChange = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch checked={false} onChange={onChange} label="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityLabel).toBe('Dark theme')
    expect(control.props.accessibilityState).toEqual({ checked: false })

    TestRenderer.act(() => {
      control.props.onPress()
    })

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('exposes the on state as checked', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch checked onChange={() => {}} label="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityState).toEqual({ checked: true })
  })
})
