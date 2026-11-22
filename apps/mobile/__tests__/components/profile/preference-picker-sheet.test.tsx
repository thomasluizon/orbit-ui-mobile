import React, { createRef } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PreferencePickerSheet } from '@/components/profile/preferences-sections'
import type { SheetHandle } from '@/components/ui/sheet'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig } from '../../../test-mocks/react-native'
import { focusHost, withFocusProvenance } from '../../support/focus-provenance'
import { motionPresets } from '@orbit/shared/theme'

const device = vi.hoisted((): { timeZone: string | null } => ({ timeZone: 'Alpha/One' }))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@orbit/shared/utils')>(),
  getClientTimeZone: () => device.timeZone,
  getTimezoneList: () => [
    'Alpha/One',
    'Bravo/Keep',
    'Charlie/Three',
    'Delta/Keep',
  ],
}))
const flag = vi.hoisted(() => ({  }))
const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => motion.reduced }))
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
    motion.reduced = true
  })

  const settleCases = [
    ['clock', '12 hour', 'onClockFormatChange', false],
    ['timeZone', 'Charlie/Three', 'onTimeZoneChange', 'Charlie/Three'],
  ] as const

  it.each(settleCases)('marks the %s answer first and closes the sheet only after the selection settles', (picker, answer, handler, value) => {
    vi.useFakeTimers()
    try {
      motion.reduced = false
      device.timeZone = 'Charlie/Three'
      const props = { ...baseProps(), activePicker: picker }
      let tree: any
      void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
      const card = () => tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'option-card' && node.props.accessibilityLabel === answer)[0]
      void act(() => card().props.onPress())
      expect(card().props.accessibilityState.selected).toBe(true)
      expect(props[handler]).not.toHaveBeenCalled()
      expect(props.onHidden).not.toHaveBeenCalled()
      void act(() => { vi.advanceTimersByTime(motionPresets.selection.enterDuration - 1) })
      expect(props.onHidden).not.toHaveBeenCalled()
      void act(() => { vi.advanceTimersByTime(1) })
      expect(props[handler]).toHaveBeenCalledExactlyOnceWith(value)
      expect(props.onHidden).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      device.timeZone = 'Alpha/One'
    }
  })

  it.each(settleCases)('drops the pending %s answer when the sheet unmounts before the selection settles', (picker, answer, handler) => {
    vi.useFakeTimers()
    try {
      motion.reduced = false
      device.timeZone = 'Charlie/Three'
      const props = { ...baseProps(), activePicker: picker }
      let tree: any
      void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
      const card = tree.root.findAll((node: any) => typeof node.type === 'string' && node.props.testID === 'option-card' && node.props.accessibilityLabel === answer)[0]
      void act(() => card.props.onPress())
      void act(() => tree.unmount())
      void act(() => { vi.advanceTimersByTime(motionPresets.selection.enterDuration) })
      expect(props[handler]).not.toHaveBeenCalled()
      expect(props.closePicker).not.toHaveBeenCalled()
      expect(props.onHidden).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      device.timeZone = 'Alpha/One'
    }
  })

  it.each([
    ['clock', '12 hour', 'onClockFormatChange', false],
    ['weekStart', 'Sunday', 'onWeekStartChange', 0],
    ['language', 'Português', 'onLanguageChange', 'pt-BR'],
  ] as const)('shows the %s answers as quick options with the flag on: one press answers once and closes', (picker, answer, handler, value) => {
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

  describe('the time zone question with the flag on', () => {
    const hosts = (tree: any, predicate: (node: any) => boolean) => tree.root.findAll((node: any) => typeof node.type === 'string' && predicate(node))
    const cards = (tree: any) => hosts(tree, (node) => node.props.testID === 'option-card')
    const names = (tree: any) => cards(tree).map((card: any) => card.props.accessibilityLabel)
    const search = (tree: any) => hosts(tree, (node) => node.props.accessibilityLabel === 'Search timezones' && typeof node.props.onChangeText === 'function')[0]
    function open() {
      device.timeZone = 'Charlie/Three'
      const props = { ...baseProps(), activePicker: 'timeZone' as const }
      let tree: any
      void act(() => { tree = create(withFocusProvenance(<PreferencePickerSheet {...props} />)) })
      return { props, tree }
    }

    it('shows the stored time zone and the time zone of the device as the quick options, with no radio list', () => {
      const { tree } = open()
      expect(hosts(tree, (node) => node.props.accessibilityRole === 'radio')).toHaveLength(0)
      expect(names(tree)).toEqual(['America/Sao_Paulo', 'Charlie/Three'])
      expect(cards(tree).map((card: any) => card.props.accessibilityState.selected)).toEqual([true, false])
      expect(hosts(tree, (node) => node.props.testID === 'time-zone-quick-options')[0].props.accessibilityLabel).toBe(pickerTitles.timeZone)
      expect(hosts(tree, (node) => node.props.accessibilityLabel === 'Show more timezones')).toHaveLength(0)
    })

    it('answers with one press on a quick option and closes the sheet', () => {
      const { props, tree } = open()
      void act(() => cards(tree)[1].props.onPress())
      expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith('Charlie/Three')
      expect(props.onHidden).toHaveBeenCalledOnce()
    })

    it('finds any other time zone through the search, which is the free path', () => {
      const { props, tree } = open()
      void act(() => search(tree).props.onChangeText('keep'))
      expect(names(tree)).toEqual(['America/Sao_Paulo', 'Charlie/Three', 'Bravo/Keep', 'Delta/Keep'])
      void act(() => cards(tree)[3].props.onPress())
      expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith('Delta/Keep')
      expect(props.onHidden).toHaveBeenCalledOnce()
    })

    it('finds a time zone through the search when the words carry accents', () => {
      const { props, tree } = open()
      void act(() => search(tree).props.onChangeText('Kéép'))
      expect(hosts(tree, (node) => node.props.accessibilityLiveRegion === 'polite' && node.props.children === 'No timezones found')).toHaveLength(0)
      expect(names(tree)).toEqual(['America/Sao_Paulo', 'Charlie/Three', 'Bravo/Keep', 'Delta/Keep'])
      void act(() => cards(tree)[2].props.onPress())
      expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith('Bravo/Keep')
    })

    it('states a search with no match, with the quick options still in reach', () => {
      const { tree } = open()
      void act(() => search(tree).props.onChangeText('zzzz'))
      expect(hosts(tree, (node) => node.props.accessibilityLiveRegion === 'polite' && node.props.children === 'No timezones found')).toHaveLength(1)
      expect(cards(tree)).toHaveLength(2)
      expect(hosts(tree, (node) => node.props.accessibilityLabel === 'Show more timezones')).toHaveLength(0)
    })
  })
})
