import React, { createRef } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PreferencePickerSheet } from '@/components/profile/preferences-sections'
import type { SheetHandle } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setFocusImpl } from '../../../test-mocks/react-native'

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

  it('enters once and moves focus and selection with ArrowDown', () => {
    const props = baseProps()
    const focusedLabels: string[] = []
    __setFocusImpl((hostProps) => focusedLabels.push(String(hostProps.accessibilityLabel)))
    let tree: any
    void act(() => {
      tree = create(<PreferencePickerSheet {...props} />)
    })
    const radios = tree.root.findAll(
      (node: any) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio',
    )
    const preventDefault = vi.fn()

    expect(radios.map((option: any) => option.props.tabIndex)).toEqual([0, -1])
    void act(() => radios[0]!.props.onKeyDown({ nativeEvent: { key: 'ArrowDown' }, preventDefault }))
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(props.onLanguageChange).toHaveBeenCalledExactlyOnceWith('pt-BR')
    expect(focusedLabels.at(-1)).toBe('Português')
  })
})
