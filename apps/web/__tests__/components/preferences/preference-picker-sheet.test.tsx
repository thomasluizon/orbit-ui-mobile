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
  scheme: 'Color',
  weekStart: 'Week start',
}

function baseProps() {
  return {
    activePicker: null as PreferencePicker | null,
    mounted: true,
    selectedLanguage: 'en',
    currentTheme: 'dark' as const,
    currentScheme: 'purple' as const,
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
    onClose: vi.fn(),
    onLanguageChange: vi.fn(),
    onThemeModeChange: vi.fn(),
    onSchemeChange: vi.fn(),
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

  it('renders color scheme options and fires onSchemeChange without closing', () => {
    const props = { ...baseProps(), activePicker: 'scheme' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('preferences.colorBlue'))
    expect(props.onSchemeChange).toHaveBeenCalledWith('blue')
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('shows a save footer for the scheme picker that closes on click', () => {
    const props = { ...baseProps(), activePicker: 'scheme' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('common.save'))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('renders week-start options and fires onWeekStartChange on select', () => {
    const props = { ...baseProps(), activePicker: 'weekStart' as const }
    render(<PreferencePickerSheet {...props} />)
    fireEvent.click(screen.getByText('Sunday'))
    expect(props.onWeekStartChange).toHaveBeenCalledWith(0)
  })

  it('marks the currently selected language radio as checked', () => {
    const props = { ...baseProps(), activePicker: 'language' as const }
    render(<PreferencePickerSheet {...props} />)
    const checked = screen.getByRole('radio', { checked: true })
    expect(checked).toHaveTextContent('English')
  })
})
