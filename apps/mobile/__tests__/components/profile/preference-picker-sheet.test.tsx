import React, { createRef } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PreferencePickerSheet } from '@/components/profile/preferences-sections'
import type { SheetHandle } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'

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
    closePicker: (exitAction?: () => void) => exitAction?.(),
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

  it('selects the language reached by native focus', () => {
    const props = baseProps()
    let tree: any
    void act(() => {
      tree = create(<PreferencePickerSheet {...props} />)
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    expect(radios.map((option: any) => option.props.focusable)).toEqual([true, true])
    void act(() => radios[1]!.props.onFocus())
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
      tree = create(<PreferencePickerSheet {...props} />)
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

    expect(retainedOption.props.nextFocusDown).toBe(adjacentOption.props.__nativeTag)
    void act(() => adjacentOption.props.onFocus())

    expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith(adjacentLabel)
  })
})
