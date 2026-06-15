import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { ChatLanguagePicker } from '@/app/(chat)/chat/chat-language-picker'

function baseProps() {
  return {
    speechLang: 'en-US',
    setSpeechLang: vi.fn(),
    currentLangFlag: 'FLAG',
  }
}

describe('ChatLanguagePicker', () => {
  it('renders the current flag on the trigger', () => {
    render(<ChatLanguagePicker {...baseProps()} />)
    const trigger = screen.getByRole('button', { name: 'chat.speechLanguage' })
    expect(trigger).toHaveTextContent('FLAG')
  })

  it('opens the language list and selects a language', () => {
    const props = baseProps()
    render(<ChatLanguagePicker {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.speechLanguage' }))
    fireEvent.click(screen.getByText('Espanol'))
    expect(props.setSpeechLang).toHaveBeenCalledWith('es-ES')
  })
})
