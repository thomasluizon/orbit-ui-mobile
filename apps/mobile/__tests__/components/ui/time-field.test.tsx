import React from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLocaleTime } from '@orbit/shared/utils'
import {
  __resetTestHostConfig,
  __setScrollToImpl,
} from '../../../test-mocks/react-native'

import { TimeField } from '@/components/ui/time-field'
import { focusHost, withFocusProvenance } from '../../support/focus-provenance'

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

function column(tree: any, columnLabel: string): any {
  const found = tree.root.findAll(
    (node: any) =>
      node.props?.accessibilityRole === 'radiogroup' &&
      node.props?.accessibilityLabel === columnLabel,
  )[0]
  if (!found) throw new Error(`Column not found: ${columnLabel}`)
  return found
}

function radioOption(tree: any, columnLabel: string, label: string): any {
  return column(tree, columnLabel).findAll(
    (node: any) =>
      node.props?.accessibilityRole === 'radio' && node.props?.accessibilityLabel === label,
  )[0]
}

async function openPicker(tree: any) {
  const [textTrigger] = tree.root.findAllByType(Pressable)
  await TestRenderer.act(async () => {
    await Promise.resolve()
    textTrigger.props.onPress()
  })
}

async function pressOption(tree: any, columnLabel: string, label: string) {
  const option = radioOption(tree, columnLabel, label)
  expect(option).toBeDefined()
  await TestRenderer.act(async () => {
    await Promise.resolve()
    return option.props.onPress()
  })
}

async function pressDone(tree: any) {
  const done = tree.root
    .findAllByType(Pressable)
    .find((node: any) =>
      node.findAll(
        (child: any) => child.type === 'Text' && child.props.children === 'common.done',
      ).length > 0,
    )
  if (!done) throw new Error('Done action not found')
  await TestRenderer.act(async () => {
    await Promise.resolve()
    return done.props.onPress()
  })
}

describe('TimeField', () => {
  beforeEach(() => {
    mockUses24HourClock = true
    __resetTestHostConfig()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the display value in the locale 24-hour format when uses24HourClock is true', async () => {
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="14:30" onChange={vi.fn()} placeholder="HH:MM" />),
      )
    })

    const [input] = tree.root.findAllByType('TextInput')
    expect(input.props.value).toBe(
      formatLocaleTime('14:30', 'pt-BR', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      }),
    )
  })

  it('offers every minute, so an odd minute like 07:13 is selectable in a 24-hour locale', async () => {
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="14:30" onChange={onChange} placeholder="HH:MM" />),
      )
    })

    await openPicker(tree)
    await pressOption(tree, 'common.hours', '07')
    await pressOption(tree, 'common.minutes', '13')
    await pressDone(tree)

    expect(onChange).toHaveBeenCalledWith('07:13')
  })

  it('keeps the canonical HH:MM value for an odd minute picked in a 12-hour locale', async () => {
    mockUses24HourClock = false
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="14:30" onChange={onChange} placeholder="HH:MM" />),
      )
    })

    await openPicker(tree)
    await pressOption(tree, 'common.hours', '09')
    await pressOption(tree, 'common.minutes', '45')
    await pressOption(tree, 'common.amPm', 'PM')
    await pressDone(tree)

    expect(onChange).toHaveBeenCalledWith('21:45')
  })

  it('opens on the persisted odd minute rather than snapping it to a half hour', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="07:15" onChange={vi.fn()} placeholder="HH:MM" />),
      )
    })

    await openPicker(tree)

    expect(radioOption(tree, 'common.hours', '07').props.accessibilityState.selected).toBe(true)
    expect(radioOption(tree, 'common.minutes', '15').props.accessibilityState.selected).toBe(true)
  })

  it('coordinates nested picker scrolling and reaches a late selected hour', async () => {
    const scrollTo = vi.fn()
    __setScrollToImpl(scrollTo)
    let tree: ReturnType<typeof TestRenderer.create>

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="23:59" onChange={vi.fn()} placeholder="HH:MM" />),
      )
    })

    await openPicker(tree)
    const hours = column(tree, 'common.hours')
    const minutes = column(tree, 'common.minutes')
    const hoursScroll = hours.findAll((node: any) => node.type === 'ScrollView')[0]
    const minutesScroll = minutes.findAll((node: any) => node.type === 'ScrollView')[0]
    expect(hoursScroll.props.nestedScrollEnabled).toBe(true)
    expect(minutesScroll.props.nestedScrollEnabled).toBe(true)

    TestRenderer.act(() => {
      hoursScroll.props.onLayout()
      minutesScroll.props.onLayout()
    })

    expect(scrollTo).toHaveBeenCalledWith({ y: 924, animated: false })
    expect(scrollTo).toHaveBeenCalledWith({ y: 2508, animated: false })
  })

  it('renders a clear button when value is set and onClear is provided', async () => {
    const onClear = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="14:30" onChange={vi.fn()} onClear={onClear} />),
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
        withFocusProvenance(<TimeField value="" onChange={vi.fn()} onClear={vi.fn()} />),
      )
    })

    const pressables = tree.root.findAllByType(Pressable)
    const clearButton = pressables.find(
      (p: any) => p.props.accessibilityLabel === 'common.clear',
    )

    expect(clearButton).toBeUndefined()
  })

  it('keeps initial column focus on the receiving time without changing selection', async () => {
    const onChange = vi.fn()
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="23:59" onChange={onChange} placeholder="HH:MM" />),
      )
    })
    await openPicker(tree)

    TestRenderer.act(() => {
      focusHost(tree, radioOption(tree, 'common.hours', '00'))
    })

    expect(radioOption(tree, 'common.hours', '23').props.accessibilityState.checked).toBe(true)
    expect(radioOption(tree, 'common.hours', '00').props.accessibilityState.checked).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves directional focus to the platform so arrows reach the other columns', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="14:30" onChange={vi.fn()} placeholder="HH:MM" />),
      )
    })
    await openPicker(tree)
    const hours = column(tree, 'common.hours').findAll(
      (node: any) => typeof node.type === 'string' && node.props?.accessibilityRole === 'radio',
    )
    const hourHandles = new Set(hours.map((hour: any) => hour.props.__nativeTag))

    expect(hours.length).toBeGreaterThan(1)
    expect(hours.every((hour: any) => hour.props.focusable === true)).toBe(true)
    for (const direction of ['nextFocusDown', 'nextFocusLeft', 'nextFocusRight', 'nextFocusUp']) {
      expect(hours.filter((hour: any) => hourHandles.has(hour.props[direction]))).toEqual([])
    }
  })

  it('selects a time option when native focus moves inside its column', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(<TimeField value="23:59" onChange={vi.fn()} placeholder="HH:MM" />),
      )
    })
    await openPicker(tree)
    TestRenderer.act(() => {
      focusHost(tree, radioOption(tree, 'common.hours', '23'))
      focusHost(tree, radioOption(tree, 'common.hours', '00'))
    })
    expect(radioOption(tree, 'common.hours', '00').props.accessibilityState.checked).toBe(true)
    TestRenderer.act(() => {
      focusHost(tree, radioOption(tree, 'common.minutes', '59'))
      focusHost(tree, radioOption(tree, 'common.minutes', '00'))
    })
    expect(radioOption(tree, 'common.minutes', '00').props.accessibilityState.checked).toBe(true)
  })

  it('treats a time column re-entry as entry instead of movement', async () => {
    let tree: any

    await TestRenderer.act(async () => {
      await Promise.resolve()
      tree = TestRenderer.create(
        withFocusProvenance(
          <>
            <TimeField value="23:59" onChange={vi.fn()} placeholder="HH:MM" />
            <View focusable accessibilityLabel="Outside" />
          </>,
        ),
      )
    })
    await openPicker(tree)
    const selectedHour = radioOption(tree, 'common.hours', '23')
    const nextHour = radioOption(tree, 'common.hours', '00')
    const outside = tree.root.find(
      (node: any) => typeof node.type === 'string'
        && node.props.accessibilityLabel === 'Outside',
    )
    TestRenderer.act(() => {
      focusHost(tree, selectedHour)
      focusHost(tree, outside)
      focusHost(tree, nextHour)
    })

    expect(radioOption(tree, 'common.hours', '23').props.accessibilityState.checked).toBe(true)
    expect(radioOption(tree, 'common.hours', '00').props.accessibilityState.checked).toBe(false)
  })
})
