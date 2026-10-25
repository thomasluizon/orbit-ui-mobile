import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { ActiveView } from '@orbit/shared/stores'
import { HabitViewSwitch } from '@/components/today/habit-view-switch'

function Example({ onChange }: Readonly<{ onChange: (view: ActiveView) => void }>) {
  const [value, setValue] = useState<ActiveView>('today')
  return <HabitViewSwitch value={value} onChange={(next) => { setValue(next); onChange(next) }} />
}

afterEach(() => { vi.useRealTimers() })

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }])('HabitViewSwitch in $locale', ({ locale, messages }) => {
  it('checks General after two consecutive ArrowRight presses from Today', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NextIntlClientProvider locale={locale} messages={messages}><Example onChange={onChange} /></NextIntlClientProvider>)
    expect(screen.getByRole('radiogroup', { name: messages.habits.viewsLabel })).toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('radio', { name: messages.habits.viewToday, checked: true })).toHaveFocus()
    for (const label of [messages.habits.viewAll, messages.habits.viewGeneral]) {
      await user.keyboard('{ArrowRight>}')
      await waitFor(() => expect(screen.getByRole('radio', { name: label, checked: true })).toHaveFocus())
      await user.keyboard('{/ArrowRight}')
    }
    expect(onChange.mock.calls).toEqual([['all'], ['general']])
  })

  it('checks All and General synchronously when arrow keys are pressed back to back without advancing timers', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<NextIntlClientProvider locale={locale} messages={messages}><Example onChange={onChange} /></NextIntlClientProvider>)
    act(() => { screen.getByRole('radio', { name: messages.habits.viewToday }).focus() })
    for (const label of [messages.habits.viewAll, messages.habits.viewGeneral]) {
      const selected = screen.getByRole('radio', { checked: true })
      fireEvent.keyDown(selected, { key: 'ArrowRight' })
      fireEvent.keyUp(selected, { key: 'ArrowRight' })
      expect(screen.getByRole('radio', { name: label })).toHaveFocus()
      expect(screen.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true')
    }
    expect(onChange.mock.calls).toEqual([['all'], ['general']])
  })
})
