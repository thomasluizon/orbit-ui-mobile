import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionField } from '@/components/ui/selection-field'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/theme', () => ({
  createTokensV2: () => new Proxy({}, { get: () => '#111111' }),
  radius: new Proxy({}, { get: () => 12 }),
}))

vi.mock('@/components/ui/icons', () => {
  const React = require('react')
  return {
    ChevronDown: (props: any) => React.createElement('ChevronDown', props),
  }
})

const OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
]

function render(props: Partial<React.ComponentProps<typeof SelectionField>> = {}) {
  const onChange = vi.fn()
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      React.createElement(SelectionField, {
        value: null,
        onChange,
        options: OPTIONS,
        label: 'Repeat',
        ...props,
      }),
    )
  })
  return { tree, onChange }
}

function findByRole(tree: any, role: string, label?: string) {
  return tree.root.findAll(
    (node: any) =>
      typeof node.type === 'string' &&
      node.props?.accessibilityRole === role &&
      (label === undefined || node.props?.accessibilityLabel === label),
  )
}

function openSheet(tree: any) {
  const trigger = findByRole(tree, 'button', 'Repeat').at(-1)
  if (!trigger) throw new Error('Trigger not found')
  TestRenderer.act(() => {
    trigger.props.onPress()
  })
}

function pressOption(tree: any, label: string) {
  const option = findByRole(tree, 'radio', label).at(-1)
  if (!option) throw new Error(`Option not found: ${label}`)
  TestRenderer.act(() => {
    option.props.onPress()
  })
}

function sheetCount(tree: any) {
  return tree.root.findAllByType('Sheet').length
}

describe('SelectionField', () => {
  beforeEach(() => {
    sheetTestControls.defer(false)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('shows the label until an option is selected', () => {
    const { tree } = render()
    const trigger = findByRole(tree, 'button', 'Repeat').at(-1)

    expect(trigger.findAllByType('Text').at(0).props.children).toBe('Repeat')
    expect(sheetCount(tree)).toBe(0)
  })

  it('shows the selected option label', () => {
    const { tree } = render({ value: 'weekly' })
    const trigger = findByRole(tree, 'button', 'Repeat').at(-1)

    expect(trigger.findAllByType('Text').at(0).props.children).toBe('Every week')
  })

  it('opens a sheet listing every option and marks the selected one', () => {
    const { tree } = render({ value: 'daily' })

    openSheet(tree)

    expect(sheetCount(tree)).toBe(1)
    const options = findByRole(tree, 'radio')
    expect(options.map((node: any) => node.props.accessibilityLabel)).toEqual([
      'Every day',
      'Every week',
    ])
    expect(options[0].props.accessibilityState.checked).toBe(true)
    expect(options[1].props.accessibilityState.checked).toBe(false)
  })

  it('reports the chosen option and closes', () => {
    const { tree, onChange } = render()

    openSheet(tree)
    pressOption(tree, 'Every week')

    expect(onChange).toHaveBeenCalledWith('weekly')
    expect(sheetCount(tree)).toBe(0)
  })

  it('falls back to empty text when it has no label and no selection', () => {
    const { tree } = render({ label: undefined })
    const trigger = findByRole(tree, 'button').at(-1)

    expect(trigger.findAllByType('Text').at(0).props.children).toBe('')
  })

  it('marks the trigger while it is pressed', () => {
    const { tree } = render()
    const trigger = findByRole(tree, 'button', 'Repeat').at(-1)

    const idle = trigger.props.style({ pressed: false })
    const pressed = trigger.props.style({ pressed: true })

    expect(idle.at(-1)).toBeNull()
    expect(pressed.at(-1)).toEqual({ opacity: 0.7, transform: [{ scale: 0.96 }] })
  })

  it('closes without reporting a change when the sheet is dismissed', () => {
    const { tree, onChange } = render()

    openSheet(tree)
    const dismiss = tree.root
      .findAll((node: any) => node.props?.accessibilityLabel === 'attempt-dismiss')
      .at(-1)
    TestRenderer.act(() => {
      dismiss.props.onPress()
    })

    expect(sheetCount(tree)).toBe(0)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports the chosen option only once the dismissal completes', () => {
    sheetTestControls.defer(true)
    const { tree, onChange } = render()

    openSheet(tree)
    pressOption(tree, 'Every day')

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(sheetCount(tree)).toBe(1)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onChange).toHaveBeenCalledWith('daily')
    expect(sheetCount(tree)).toBe(0)
  })
})
