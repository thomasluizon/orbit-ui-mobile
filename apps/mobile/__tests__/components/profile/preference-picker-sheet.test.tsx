import React, { createRef } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PreferencePickerSheet } from '@/components/profile/preferences-sections'
import type { SheetHandle } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'
import { focusHost, withFocusProvenance } from '../../support/focus-provenance'

vi.mock('@orbit/shared/utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/utils')>(),
  getTimezoneList: () => [
    'Alpha/One',
    'Bravo/Keep',
    'Charlie/Three',
    'Delta/Keep',
  ],
}))
const flag = vi.hoisted(() => ({ guided: false }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => flag.guided }))
vi.mock('@/components/marketing-consent/marketing-consent-section', () => ({
  MarketingConsentSection: () => null,
}))
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

const pickerTitles = {
  language: 'Language',
  timeZone: 'Timezone',
  weekStart: 'Week start',
  clock: 'Clock',
}

function baseProps() {
  return {
    tokens: createTokensV2('purple', 'dark'),
    activePicker: 'language' as const,
    pickerTitles,
    pickerDescriptions: {},
    timeZoneSearchLabel: 'Search timezones',
    timeZoneNoResultsLabel: 'No timezones found',
    timeZoneShowMoreLabel: 'Show more timezones',
    selectedLanguage: 'en' as const,
    timeZone: 'America/Sao_Paulo',
    weekStartDay: 1,
    clockFormatOptions: [{ value: '24h' as const, label: '24 hour' }, { value: '12h' as const, label: '12 hour' }],
    uses24HourClock: true,
    weekStartOptions: [
      { value: 1 as const, label: 'Monday' },
      { value: 0 as const, label: 'Sunday' },
    ],
    sheetRef: createRef<SheetHandle>(),
    closePicker: vi.fn((exitAction?: () => void) => exitAction?.()),
    onHidden: vi.fn(),
    onLanguageChange: vi.fn(),
    onTimeZoneChange: vi.fn(),
    onWeekStartChange: vi.fn(),
    onClockFormatChange: vi.fn(),
  }
}

describe('PreferencePickerSheet', () => {
  beforeEach(() => {
    __resetTestHostConfig()
    flag.guided = false
  })

  it.each([
    ['clock', '12 hour', 'onClockFormatChange', false],
    ['weekStart', 'Sunday', 'onWeekStartChange', 0],
    ['language', 'Português', 'onLanguageChange', 'pt-BR'],
  ] as const)('shows the %s answers as quick options with the flag on: one press answers once and closes', (picker, answer, handler, value) => {
    flag.guided = true
    const props = { ...baseProps(), activePicker: picker }
    let tree: any
    void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
    expect(tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')).toHaveLength(0)
    const cards = tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.props.testID === 'option-card')
    const labels = [...new Set(cards.map((card: any) => card.props.accessibilityLabel))]
    expect(labels).toHaveLength(2)
    expect(cards.filter((card: any) => card.props.accessibilityState.selected).map((card: any) => card.props.accessibilityLabel)).not.toContain(answer)
    void act(() => cards.find((card: any) => card.props.accessibilityLabel === answer).props.onPress())
    expect(props[handler]).toHaveBeenCalledOnce()
    expect(props[handler]).toHaveBeenCalledWith(value)
    expect(props.onHidden).toHaveBeenCalledOnce()
  })

  it('keeps the time zone search and its list with the flag on', () => {
    flag.guided = true
    const props = { ...baseProps(), activePicker: 'timeZone' as const }
    let tree: any
    void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
    expect(tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node: any) => node.props.testID === 'option-card')).toHaveLength(0)
  })

  it('checks the current clock and commits one selection', () => {
    const props = { ...baseProps(), activePicker: 'clock' as const }
    let tree: any
    void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
    const radios = tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
    expect(radios.map((option: any) => option.props.accessibilityState.checked)).toEqual([true, false])
    void act(() => radios[1].props.onPress())
    expect(props.onClockFormatChange).toHaveBeenCalledOnce()
    expect(props.onClockFormatChange).toHaveBeenCalledWith(false)
  })

  it('checks the locale default when no clock preference is saved', () => {
    const props = { ...baseProps(), activePicker: 'clock' as const, uses24HourClock: undefined }
    let tree: any
    void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
    const radios = tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
    expect(radios.map((option: any) => option.props.accessibilityState.checked)).toEqual([false, true])
  })

  it('drafts the language reached by native focus without writing it', () => {
    const props = baseProps()
    let tree: any
    void act(() => {
      tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />))
    })
    const radios = () => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    expect(radios().map((option: any) => option.props.focusable)).toEqual([true, true])
    void act(() => focusHost(tree, radios()[0]))
    void act(() => focusHost(tree, radios()[1]))
    expect(radios().map((option: any) => option.props.accessibilityState.checked))
      .toEqual([false, true])
    expect(props.onLanguageChange).not.toHaveBeenCalled()
    expect(props.closePicker).not.toHaveBeenCalled()
    expect(props.onHidden).not.toHaveBeenCalled()
  })

  it('checks the current timezone once the profile resolves after a cold start', () => {
    const props = {
      ...baseProps(),
      activePicker: 'timeZone' as const,
      timeZone: null,
    }
    let tree: any
    void act(() => {
      tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />))
    })
    const radios = () => tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    expect(radios().some((option: any) => option.props.accessibilityState.checked)).toBe(false)

    void act(() => {
      tree.update(withFocusProvenance(<PreferencePickerSheet {...props} timeZone="Bravo/Keep" />))
    })

    expect(
      radios()
        .filter((option: any) => option.props.accessibilityState.checked)
        .map((option: any) => option.props.accessibilityLabel),
    ).toEqual(['Bravo/Keep'])
  })

  it('closes the sheet only when a press commits the language', () => {
    const props = baseProps()
    let tree: any
    void act(() => {
      tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />))
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => focusHost(tree, radios[0]))
    void act(() => focusHost(tree, radios[1]))
    expect(props.closePicker).not.toHaveBeenCalled()

    void act(() => radios[1]!.props.onPress())

    expect(props.onLanguageChange).toHaveBeenCalledWith('pt-BR')
    expect(props.closePicker).toHaveBeenCalledOnce()
    expect(props.onHidden).toHaveBeenCalledOnce()
  })

  it('writes the timezone once, after three focus moves and the press that commits', () => {
    const props = {
      ...baseProps(),
      activePicker: 'timeZone' as const,
      timeZone: null,
    }
    let tree: any
    void act(() => {
      tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />))
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => focusHost(tree, radios[0]))
    void act(() => focusHost(tree, radios[1]))
    void act(() => focusHost(tree, radios[2]))
    expect(props.onTimeZoneChange).not.toHaveBeenCalled()

    void act(() => radios[2]!.props.onPress())

    expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith(
      radios[2]!.props.accessibilityLabel,
    )
  })

  it('applies the language only after the sheet has finished closing', () => {
    const exitActions: (() => void)[] = []
    const props = {
      ...baseProps(),
      closePicker: vi.fn((exitAction?: () => void) => {
        if (exitAction) exitActions.push(exitAction)
      }),
    }
    let tree: any
    void act(() => {
      tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />))
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )

    void act(() => radios[1]!.props.onPress())

    expect(props.closePicker).toHaveBeenCalledOnce()
    expect(props.onLanguageChange).not.toHaveBeenCalled()

    void act(() => exitActions.forEach((exitAction) => exitAction()))

    expect(props.onHidden).toHaveBeenCalledOnce()
    expect(props.onLanguageChange).toHaveBeenCalledExactlyOnceWith('pt-BR')
  })

  it('uses rendered timezone order after filtered options remount', () => {
    const props = {
      ...baseProps(),
      activePicker: 'timeZone' as const,
      timeZone: null,
    }
    let tree: any
    void act(() => {
      tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />))
    })
    const search = tree.root.find(
      (node: any) => typeof node.type === 'string'
        && node.props.accessibilityLabel === props.timeZoneSearchLabel
        && typeof node.props.onChangeText === 'function',
    )

    void act(() => search.props.onChangeText('Keep'))
    const filteredRadios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    const retainedLabel = filteredRadios[0]!.props.accessibilityLabel

    void act(() => search.props.onChangeText(''))
    const restoredRadios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    const retainedIndex = restoredRadios.findIndex(
      (option: any) => option.props.accessibilityLabel === retainedLabel,
    )
    const adjacentOption = restoredRadios[retainedIndex + 1]!
    const adjacentLabel = adjacentOption.props.accessibilityLabel
    const retainedOption = restoredRadios[retainedIndex]!

    void act(() => focusHost(tree, retainedOption))
    void act(() => focusHost(tree, adjacentOption))
    void act(() => adjacentOption.props.onPress())

    expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith(adjacentLabel)
    expect(props.closePicker).toHaveBeenCalledOnce()
  })
})
