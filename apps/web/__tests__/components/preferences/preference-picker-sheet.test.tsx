import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PreferencePicker } from '@/app/(app)/preferences/_components/preference-picker-sheet'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

import { PreferencePickerSheet } from '@/app/(app)/preferences/_components/preference-picker-sheet'

const pickerTitles: Record<PreferencePicker, string> = {
  language: 'Language',
  theme: 'Theme',
  timeZone: 'Timezone',
  weekStart: 'Week start',
}

function baseProps() {
  return {
    activePicker: null as PreferencePicker | null,
    mounted: true,
    selectedLanguage: 'en',
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
    pickerTitles,
    pickerDescriptions: {},
    timeZoneSearchLabel: 'Search timezones',
    timeZoneNoResultsLabel: 'No timezones found',
    timeZoneShowMoreLabel: 'Show more timezones',
    onClose: vi.fn(),
    onLanguageChange: vi.fn(),
    onThemeModeChange: vi.fn(),
    onTimeZoneChange: vi.fn(),
    onWeekStartChange: vi.fn(),
  }
}

describe('PreferencePickerSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
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

  it('renders theme options and fires onThemeModeChange on select', () => {
    const props = { ...baseProps(), activePicker: 'theme' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('Dark'))
    expect(props.onThemeModeChange).toHaveBeenCalledWith('dark')
  })

  it('renders week-start options and fires onWeekStartChange on select', () => {
    const props = { ...baseProps(), activePicker: 'weekStart' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('Sunday'))
    expect(props.onWeekStartChange).toHaveBeenCalledWith(0)
  })

  it('renders timezone options and writes the selected timezone', () => {
    const props = { ...baseProps(), activePicker: 'timeZone' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search timezones' }), {
      target: { value: 'Europe/London' },
    })
    fireEvent.click(screen.getByText('Europe/London'))
    expect(props.onTimeZoneChange).toHaveBeenCalledWith('Europe/London')
  })

  it('marks the currently selected language radio as checked', () => {
    const props = { ...baseProps(), activePicker: 'language' as const }
    render(<PreferencePickerSheet {...props} />)
    const checked = screen.getByRole('radio', { checked: true })
    expect(checked).toHaveTextContent('English')
  })
})
