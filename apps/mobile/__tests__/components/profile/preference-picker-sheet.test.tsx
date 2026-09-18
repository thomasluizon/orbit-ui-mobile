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
  theme: 'Theme',
  timeZone: 'Timezone',
  weekStart: 'Week start',
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
    currentTheme: 'dark' as const,
    timeZone: 'America/Sao_Paulo',
    weekStartDay: 1,
    themeModeOptions: [
      { value: 'light' as const, label: 'Light' },
      { value: 'dark' as const, label: 'Dark' },
    ],
    weekStartOptions: [
      { value: 1 as const, label: 'Monday' },
      { value: 0 as const, label: 'Sunday' },
    ],
    sheetRef: createRef<SheetHandle>(),
    closePicker: vi.fn((exitAction?: () => void) => exitAction?.()),
    onHidden: vi.fn(),
    onLanguageChange: vi.fn(),
    onThemeModeChange: vi.fn(),
    onTimeZoneChange: vi.fn(),
    onWeekStartChange: vi.fn(),
  }
}

describe('PreferencePickerSheet', () => {
  beforeEach(() => {
    __resetTestHostConfig()
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
