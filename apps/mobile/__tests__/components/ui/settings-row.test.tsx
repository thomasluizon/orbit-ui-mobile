import React from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from '@/components/ui/settings-row'

const TestRenderer = require('react-test-renderer')

describe('Switch', () => {
  it('fires onToggle when pressed', () => {
    const onToggle = vi.fn()
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch on={false} onToggle={onToggle} accessibilityLabel="Dark theme" />,
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

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('exposes the on state as checked', () => {
    let tree: any

    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <Switch on onToggle={() => {}} accessibilityLabel="Dark theme" />,
      )
    })

    const control = tree.root.find(
      (node: any) => node.props.accessibilityRole === 'switch',
    )
    expect(control.props.accessibilityState).toEqual({ checked: true })
  })
})
