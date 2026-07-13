import React from 'react'
import { Pressable } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLocaleTime } from '@orbit/shared/utils'

import { AppTimePicker } from '@/components/ui/app-time-picker'

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
    i18n: { language: 'pt-BR' },
  }),
}))

function columns(tree: any): any[] {
  return tree.root.findAll((node: any) => node.type === 'ScrollView')
}

function optionIn(column: any, label: string): any {
  return column
    .findAll((node: any) => node.type === Pressable)
    .find((node: any) => node.props.accessibilityLabel === label)
}

function doneButton(tree: any): any {
  return tree.root.find(
    (node: any) =>
      node.type === Pressable && node.props.accessibilityLabel === 'common.done',
  )
}

describe('AppTimePicker', () => {
  beforeEach(() => {
    mockUses24HourClock = true
  })

  it('renders the display value in the locale 24-hour format when uses24HourClock is true', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="14:30" onChange={vi.fn()} placeholder="HH:MM" />,
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

  it('shows 24-hour columns (00–23, no AM/PM) and applies the chosen time', async () => {
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="14:30" onChange={onChange} placeholder="HH:MM" />,
      )
    })

    const [textTrigger] = tree.root.findAllByType(Pressable)
    await TestRenderer.act(async () => {
      textTrigger.props.onPress()
    })

    const [hoursColumn, minutesColumn, periodColumn] = columns(tree)
    expect(periodColumn).toBeUndefined()
    expect(optionIn(hoursColumn, '00')).toBeDefined()
    expect(optionIn(hoursColumn, '23')).toBeDefined()

    await TestRenderer.act(async () => {
      optionIn(hoursColumn, '07')!.props.onPress()
    })
    await TestRenderer.act(async () => {
      optionIn(minutesColumn, '45')!.props.onPress()
    })
    await TestRenderer.act(async () => {
      doneButton(tree).props.onPress()
    })

    expect(onChange).toHaveBeenCalledWith('07:45')
  })

  it('shows 12-hour columns (1–12 + AM/PM) and converts the selection to 24-hour for the API', async () => {
    mockUses24HourClock = false
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="14:30" onChange={onChange} placeholder="HH:MM" />,
      )
    })

    const [textTrigger] = tree.root.findAllByType(Pressable)
    await TestRenderer.act(async () => {
      textTrigger.props.onPress()
    })

    const [hoursColumn, minutesColumn, periodColumn] = columns(tree)
    expect(periodColumn).toBeDefined()
    expect(optionIn(hoursColumn, '12')).toBeDefined()
    expect(optionIn(hoursColumn, '00')).toBeUndefined()

    await TestRenderer.act(async () => {
      optionIn(hoursColumn, '09')!.props.onPress()
    })
    await TestRenderer.act(async () => {
      optionIn(periodColumn, 'PM')!.props.onPress()
    })
    await TestRenderer.act(async () => {
      optionIn(minutesColumn, '15')!.props.onPress()
    })
    await TestRenderer.act(async () => {
      doneButton(tree).props.onPress()
    })

    expect(onChange).toHaveBeenCalledWith('21:15')
  })

  it('renders a clear button when value is set and onClear is provided', async () => {
    const onClear = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="14:30" onChange={vi.fn()} onClear={onClear} />,
      )
    })

    const pressables = tree.root.findAllByType(Pressable)
    const clearButton = pressables.find(
      (p: any) => p.props.accessibilityLabel === 'common.clear',
    )

    expect(clearButton).toBeDefined()

    await TestRenderer.act(async () => {
      clearButton.props.onPress()
    })

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('does not render a clear button when value is empty', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="" onChange={vi.fn()} onClear={vi.fn()} />,
      )
    })

    const pressables = tree.root.findAllByType(Pressable)
    const clearButton = pressables.find(
      (p: any) => p.props.accessibilityLabel === 'common.clear',
    )

    expect(clearButton).toBeUndefined()
  })
})
