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

  it('enters the language group once and drafts the next option with ArrowDown', () => {
    const props = { ...baseProps(), activePicker: 'language' as const }
    render(<PreferencePickerSheet {...props} />)
    const english = screen.getByRole('radio', { name: 'English' })
    const portuguese = screen.getByRole('radio', { name: 'Português' })

    expect([english.tabIndex, portuguese.tabIndex]).toEqual([0, -1])
    const focus = vi.spyOn(portuguese, 'focus')
    english.focus()
    fireEvent.keyDown(english, { key: 'ArrowDown' })
    expect(portuguese).toHaveAttribute('aria-checked', 'true')
    expect(props.onLanguageChange).not.toHaveBeenCalled()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('keeps the language sheet open when ArrowDown moves the selection', () => {
    const props = { ...baseProps(), activePicker: 'language' as const }
    render(<PreferencePickerSheet {...props} />)
    const english = screen.getByRole('radio', { name: 'English' })

    english.focus()
    fireEvent.keyDown(english, { key: 'ArrowDown' })

    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Português' })).toBeInTheDocument()
  })

  it('closes the language sheet only once an activation commits the moved selection', () => {
    const props = { ...baseProps(), activePicker: 'language' as const }
    render(<PreferencePickerSheet {...props} />)
    const english = screen.getByRole('radio', { name: 'English' })

    english.focus()
    fireEvent.keyDown(english, { key: 'ArrowDown' })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onLanguageChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('radio', { name: 'Português' }))

    expect(props.onLanguageChange).toHaveBeenCalledExactlyOnceWith('pt-BR')
    expect(props.onClose).toHaveBeenCalled()
  })

  it('writes the timezone once, after three arrow moves and the activation that commits', () => {
    const props = { ...baseProps(), activePicker: 'timeZone' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search timezones' }), {
      target: { value: 'Europe/' },
    })
    const options = screen.getAllByRole('radio')
    expect(options.length).toBeGreaterThan(3)

    options[0]!.focus()
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' })
    fireEvent.keyDown(options[1]!, { key: 'ArrowDown' })
    fireEvent.keyDown(options[2]!, { key: 'ArrowDown' })
    expect(options[3]!).toHaveAttribute('aria-checked', 'true')
    expect(props.onTimeZoneChange).not.toHaveBeenCalled()

    fireEvent.click(options[3]!)

    expect(props.onTimeZoneChange).toHaveBeenCalledExactlyOnceWith(options[3]!.textContent)
  })

  it('keeps the timezone sheet open when ArrowDown moves the selection', () => {
    const props = { ...baseProps(), activePicker: 'timeZone' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search timezones' }), {
      target: { value: 'Europe/L' },
    })
    const options = screen.getAllByRole('radio')
    expect(options.length).toBeGreaterThan(1)

    options[0]!.focus()
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' })

    expect(options[1]!).toHaveAttribute('aria-checked', 'true')
    expect(props.onTimeZoneChange).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getAllByRole('radio').length).toBe(options.length)
  })
})
