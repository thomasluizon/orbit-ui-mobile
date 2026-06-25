import React from 'react'
import { Pressable } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLocaleTime } from '@orbit/shared/utils'
import {
  dateTimePickerOpenCalls,
  resetDateTimePickerMock,
} from '@/test-mocks/react-native-datetimepicker'

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

describe('AppTimePicker', () => {
  beforeEach(() => {
    resetDateTimePickerMock()
    mockUses24HourClock = true
  })

  it('uses the active locale for display text and Android 24-hour picker mode when uses24HourClock is true', async () => {
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker value="14:30" onChange={onChange} placeholder="HH:MM" />,
      )
    })

    const [textTrigger] = tree.root.findAllByType(Pressable)
    const label = tree.root.findByType('Text')

    expect(label.props.children).toBe(
      formatLocaleTime('14:30', 'pt-BR', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      }),
    )

    await TestRenderer.act(async () => {
      textTrigger.props.onPress()
    })

    expect(dateTimePickerOpenCalls).toHaveLength(1)
    expect(dateTimePickerOpenCalls[0]?.is24Hour).toBe(true)
  })

  it('opens the Android picker in 12-hour mode when uses24HourClock is false', async () => {
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

    expect(dateTimePickerOpenCalls).toHaveLength(1)
    expect(dateTimePickerOpenCalls[0]?.is24Hour).toBe(false)
  })

  it('renders a clear button when value is set and onClear is provided', async () => {
    const onClear = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AppTimePicker
          value="14:30"
          onChange={vi.fn()}
          onClear={onClear}
        />,
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
