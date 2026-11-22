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
