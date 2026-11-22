import { pressRadioKey } from '@/__tests__/support/radio-key'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { PreferencePicker } from '@/app/(app)/preferences/_components/preference-picker-sheet'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const flag = vi.hoisted(() => ({  }))
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

describe('PreferencePickerSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    motion.reduced = true
  })

  const settleCases = [
    ['clock', '12 hour', 'onClockFormatChange', false],
    ['timeZone', 'Europe/Lisbon', 'onTimeZoneChange', 'Europe/Lisbon'],
  ] as const

  it.each(settleCases)('marks the %s answer first and closes the sheet only after the selection settles', (picker, answer, handler, value) => {
    vi.useFakeTimers()
    try {
      motion.reduced = false
      device.timeZone = 'Europe/Lisbon'
      const props = { ...baseProps(), activePicker: picker }
      render(<PreferencePickerSheet {...props} />)
      fireEvent.click(screen.getByRole('button', { name: answer }))
      expect(screen.getByRole('button', { name: answer })).toHaveAttribute('data-selected')
      expect(props[handler]).not.toHaveBeenCalled()
      expect(props.onClose).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(motionPresets.selection.enterDuration - 1) })
      expect(props.onClose).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(1) })
      expect(props[handler]).toHaveBeenCalledExactlyOnceWith(value)
      expect(props.onClose).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      device.timeZone = 'America/Sao_Paulo'
    }
  })

  it.each(settleCases)('drops the pending %s answer when the sheet unmounts before the selection settles', (picker, answer, handler) => {
    vi.useFakeTimers()
    try {
      motion.reduced = false
      device.timeZone = 'Europe/Lisbon'
      const props = { ...baseProps(), activePicker: picker }
      const view = render(<PreferencePickerSheet {...props} />)
      fireEvent.click(screen.getByRole('button', { name: answer }))
      view.unmount()
      act(() => { vi.advanceTimersByTime(motionPresets.selection.enterDuration) })
      expect(props[handler]).not.toHaveBeenCalled()
      expect(props.onClose).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      device.timeZone = 'America/Sao_Paulo'
    }
  })

  it.each([
    ['clock', '12 hour', '24 hour', 'onClockFormatChange', false],
    ['weekStart', 'Sunday', 'Monday', 'onWeekStartChange', 0],
    ['language', 'Português', 'English', 'onLanguageChange', 'pt-BR'],
  ] as const)('shows the %s answers as quick options with the flag on: one press answers once and closes', (picker, answer, current, handler, value) => {
    const props = { ...baseProps(), activePicker: picker }
    render(<PreferencePickerSheet {...props} />)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    const group = screen.getByRole('group', { name: pickerTitles[picker] })
    expect(group.querySelectorAll('[data-option-card]')).toHaveLength(2)
    expect(screen.getByRole('button', { name: current })).toHaveAttribute('data-selected')
    expect(screen.getByRole('button', { name: answer })).not.toHaveAttribute('data-selected')
    fireEvent.keyDown(screen.getByRole('button', { name: current }), { key: 'ArrowRight' })
    expect(props[handler]).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: answer }))
    expect(props[handler]).toHaveBeenCalledOnce()
    expect(props[handler]).toHaveBeenCalledWith(value)
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  describe('the time zone question with the flag on', () => {
    const cards = () => [...document.querySelectorAll<HTMLButtonElement>('[data-option-card]')]
    const search = () => screen.getByRole('searchbox', { name: 'Search timezones' })
    function open() {
      device.timeZone = 'Europe/Lisbon'
      const props = { ...baseProps(), activePicker: 'timeZone' as const }
      render(<PreferencePickerSheet {...props} />)
      return props
    }

    it('shows the stored time zone and the time zone of the device as the quick options, with no radio list, no raw field and no inline style', () => {
      open()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
      expect(cards().map((card) => card.textContent)).toEqual(['America/Sao_Paulo', 'Europe/Lisbon'])
      expect(screen.getByRole('group', { name: pickerTitles.timeZone }).querySelectorAll('[data-option-card]')).toHaveLength(2)
      expect(cards().map((card) => card.hasAttribute('data-selected'))).toEqual([true, false])
      expect(cards().every((card) => card.parentElement?.hasAttribute('data-option-wide'))).toBe(true)
      const dialog = screen.getByRole('dialog')
      expect(dialog.querySelector('input.form-input')).toBeNull()
      expect(dialog.querySelector('[data-time-zone-question] [style*="border-radius"]')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Show more timezones' })).not.toBeInTheDocument()
    })

    it('answers with one press on a quick option and closes the sheet, and an arrow key only moves the focus', () => {
      const props = open()
      fireEvent.keyDown(screen.getByRole('button', { name: 'America/Sao_Paulo' }), { key: 'ArrowDown' })
      expect(screen.getByRole('button', { name: 'Europe/Lisbon' })).toHaveFocus()
      expect(props.onTimeZoneChange).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Europe/Lisbon' }))
      expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith('Europe/Lisbon')
      expect(props.onClose).toHaveBeenCalledOnce()
    })

    it('finds any other time zone through the search, which is the free path', () => {
      const props = open()
      fireEvent.change(search(), { target: { value: 'london' } })
      expect(screen.getByRole('group', { name: 'Search timezones' }).querySelectorAll('[data-option-card]')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Europe/London' }))
      expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith('Europe/London')
      expect(props.onClose).toHaveBeenCalledOnce()
    })

    it.each([['São Paulo', 'America/Sao_Paulo'], ['Bogotá', 'America/Bogota']])('finds %s through the search with its accents', (query, zone) => {
      const props = open()
      fireEvent.change(search(), { target: { value: query } })
      expect(screen.queryByText('No timezones found')).not.toBeInTheDocument()
      const matches = screen.getByRole('group', { name: 'Search timezones' })
      expect([...matches.querySelectorAll('[data-option-card]')].map((card) => card.textContent)).toEqual([zone])
      fireEvent.click(within(matches).getByRole('button', { name: zone }))
      expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith(zone)
    })

    it('states a search with no match and pages a search with many matches', () => {
      open()
      fireEvent.change(search(), { target: { value: 'zzzz' } })
      expect(screen.getByText('No timezones found')).toHaveAttribute('role', 'status')
      expect(cards()).toHaveLength(2)
      fireEvent.change(search(), { target: { value: 'america' } })
      expect(screen.queryByText('No timezones found')).not.toBeInTheDocument()
      expect(cards()).toHaveLength(2 + 20)
      fireEvent.click(screen.getByRole('button', { name: 'Show more timezones' }))
      expect(cards()).toHaveLength(2 + 40)
    })
  })

  it('renders nothing when no picker is active', () => {
    render(<PreferencePickerSheet {...baseProps()} />)
    expect(screen.queryByText('English')).not.toBeInTheDocument()
  })

  it('renders the language options and fires onLanguageChange + onClose on select', () => {
    const props = { ...baseProps(), activePicker: 'language' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('Português'))
    expect(props.onLanguageChange).toHaveBeenCalledWith('pt-BR')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('renders week-start options and fires onWeekStartChange on select', () => {
    const props = { ...baseProps(), activePicker: 'weekStart' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('Sunday'))
    expect(props.onWeekStartChange).toHaveBeenCalledWith(0)
  })
})
