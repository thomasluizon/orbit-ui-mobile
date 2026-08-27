import React from 'react'
import { Pressable } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLocaleTime } from '@orbit/shared/utils'

import { TimeField } from '@/components/ui/time-field'

const TestRenderer = require('react-test-renderer')

let mockUses24HourClock = true

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      uses24HourClock: mockUses24HourClock,
      timeZone: 'America/Sao_Paulo',
    },
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
    i18n: { language: mockUses24HourClock ? 'pt-BR' : 'en-US' },
  }),
}))

function radioOption(tree: any, label: string): any {
  return tree.root.findAllByType(Pressable).find(
    (node: any) => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label,
  )
}

describe('TimeField', () => {
  beforeEach(() => {
    mockUses24HourClock = true
  })

  it('renders the display value in the locale 24-hour format when uses24HourClock is true', async () => {
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        <TimeField value="14:30" onChange={vi.fn()} placeholder="HH:MM" />,
      )
    })

    const [textTrigger] = tree.root.findAllByType(Pressable)
    const label = textTrigger.findByType('Text')
    expect(label.props.children).toBe(
      formatLocaleTime('14:30', 'pt-BR', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      }),
    )
  })

  it('shows half-hour radio rows in 24-hour locale format and applies one choice', async () => {
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        <TimeField value="14:30" onChange={onChange} placeholder="HH:MM" />,
      )
    })

    const [textTrigger] = tree.root.findAllByType(Pressable)
    await TestRenderer.act(async () => {
await Promise.resolve()
      textTrigger.props.onPress()
    })

    const label = formatLocaleTime('07:30', 'pt-BR', { hour: 'numeric', minute: '2-digit' })
    expect(radioOption(tree, label)).toBeDefined()
    await TestRenderer.act(async () => { await Promise.resolve(); return radioOption(tree, label).props.onPress(); })
    expect(onChange).toHaveBeenCalledWith('07:30')
  })

  it('shows the same choices in 12-hour locale format while preserving the API value', async () => {
    mockUses24HourClock = false
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        <TimeField value="14:30" onChange={onChange} placeholder="HH:MM" />,
      )
    })

    const [textTrigger] = tree.root.findAllByType(Pressable)
    await TestRenderer.act(async () => {
await Promise.resolve()
      textTrigger.props.onPress()
    })

    const label = formatLocaleTime('21:30', 'en-US', { hour: 'numeric', minute: '2-digit' })
    expect(radioOption(tree, label)).toBeDefined()
    await TestRenderer.act(async () => { await Promise.resolve(); return radioOption(tree, label).props.onPress(); })
    expect(onChange).toHaveBeenCalledWith('21:30')
  })

  it('renders a clear button when value is set and onClear is provided', async () => {
    const onClear = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        <TimeField value="14:30" onChange={vi.fn()} onClear={onClear} />,
      )
    })

    const pressables = tree.root.findAllByType(Pressable)
    const clearButton = pressables.find(
      (p: any) => p.props.accessibilityLabel === 'common.clear',
    )

    expect(clearButton).toBeDefined()

    await TestRenderer.act(async () => {
await Promise.resolve()
      clearButton.props.onPress()
    })

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('does not render a clear button when value is empty', async () => {
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        <TimeField value="" onChange={vi.fn()} onClear={vi.fn()} />,
      )
    })

    const pressables = tree.root.findAllByType(Pressable)
    const clearButton = pressables.find(
      (p: any) => p.props.accessibilityLabel === 'common.clear',
    )

    expect(clearButton).toBeUndefined()
  })
})
