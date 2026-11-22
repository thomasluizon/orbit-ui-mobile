import { pressRadioKey } from '@/__tests__/support/radio-key'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { PreferencePicker } from '@/app/(app)/preferences/_components/preference-picker-sheet'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/hooks/use-viewport-match', () => ({ useViewportMatch: (query: string) => query.includes('reduce') ? motion.reduced : false }))
const device = vi.hoisted(() => ({ timeZone: 'America/Sao_Paulo' as string | null }))
vi.mock('@orbit/shared/utils', async (importOriginal) => ({ ...await importOriginal<typeof import('@orbit/shared/utils')>(), getClientTimeZone: () => device.timeZone }))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { PreferencePickerSheet } from '@/app/(app)/preferences/_components/preference-picker-sheet'
import { motionPresets } from '@orbit/shared/theme'
import { act } from 'react'

const pickerTitles: Record<PreferencePicker, string> = {
  language: 'Language',
  timeZone: 'Timezone',
  weekStart: 'Week start',
  clock: 'Clock',
}

function baseProps() {
  return {
    activePicker: null as PreferencePicker | null,
    mounted: true,
    selectedLanguage: 'en' as const,
    timeZone: 'America/Sao_Paulo',
    weekStartDay: 1,
    weekStartOptions: [
      { value: 1 as const, label: 'Monday' },
      { value: 0 as const, label: 'Sunday' },
    ],
    clockFormatOptions: [{ value: '24h' as const, label: '24 hour' }, { value: '12h' as const, label: '12 hour' }],
    uses24HourClock: true,
    pickerTitles,
    pickerDescriptions: {},
    timeZoneSearchLabel: 'Search timezones',
    timeZoneNoResultsLabel: 'No timezones found',
    timeZoneShowMoreLabel: 'Show more timezones',
    onClose: vi.fn(),
    onLanguageChange: vi.fn(),
    onTimeZoneChange: vi.fn(),
    onWeekStartChange: vi.fn(),
    onClockFormatChange: vi.fn(),
  }
}
