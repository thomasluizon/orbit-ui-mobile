import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Composer } from '@/components/shell/composer'
import { useUIStore } from '@/stores/ui-store'

beforeEach(() => useUIStore.setState({ habitComposerCollapsed: false }))

it.each([en, ptBR])('collapses and expands the mounted draft, remembers the choice and sends once', messages => {
  const onSend = vi.fn()
  function Draft() {
    const [value, setValue] = useState('')
    return <NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
      <Composer collapsible state="idle" value={value} onChangeValue={setValue} onSend={onSend} words={messages.shell.composer} suggestions={[]} />
    </NextIntlClientProvider>
  }
  const view = render(<Draft />)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Keep this draft' } })
  const toggle = screen.getByRole('button', { name: messages.shell.composer.collapse })
  fireEvent.click(toggle)
  const expand = screen.getByRole('button', { name: messages.shell.composer.expand })
  expect(expand).toHaveAttribute('aria-expanded', 'false')
  expect(expand).toHaveFocus()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(input).toHaveValue('Keep this draft')
  expect(input).toBeInTheDocument()
  expect(expand).toHaveTextContent('')
  expect(expand.querySelector('[data-asset="astra-mark"]')).not.toBeNull()
  expect(useUIStore.getState().habitComposerCollapsed).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.expand }))
  expect(screen.getByRole('button', { name: messages.shell.composer.collapse })).toHaveFocus()
  expect(screen.getByRole('textbox')).toBe(input)
  expect(input).toHaveValue('Keep this draft')
  const send = screen.getByRole('button', { name: messages.shell.composer.send })
  expect(within(send).queryByText(/Astra/)).toBeNull()
  fireEvent.click(send)
  expect(onSend).toHaveBeenCalledOnce()
  fireEvent.click(toggle)
  view.unmount()
  render(<Draft />)
  expect(screen.getByRole('button', { name: messages.shell.composer.expand })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('textbox')).toBeNull()
})

it('keeps the ordinary composer expanded when the habit preference is collapsed', () => {
  useUIStore.setState({ habitComposerCollapsed: true })
  render(<NextIntlClientProvider locale="en" messages={en}><Composer state="idle" value="" onChangeValue={vi.fn()} onSend={vi.fn()} words={en.shell.composer} suggestions={[]} /></NextIntlClientProvider>)
  expect(screen.getByRole('textbox')).toBeVisible()
  expect(screen.queryByRole('button', { name: en.shell.composer.expand })).toBeNull()
})

it.each([en, ptBR])('retains Clear and Paste in the actions menu when collapse occupies their slot', async messages => {
  vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('Pasted draft') } })
  function Draft() {
    const [value, setValue] = useState('Draft')
    return <NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
      <Composer collapsible state="idle" value={value} onChangeValue={setValue} onSend={vi.fn()} words={messages.shell.composer}
        suggestions={[]} onAttachFile={vi.fn()} attachWords={{ ...messages.shell.composer.attach, remove: (name: string) => name }} />
    </NextIntlClientProvider>
  }
  const view = render(<Draft />)
  try {
    fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.actions }))
    fireEvent.click(await screen.findByRole('menuitem', { name: messages.shell.composer.clear }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: messages.shell.composer.actions }))
    fireEvent.click(await screen.findByRole('menuitem', { name: messages.shell.composer.paste }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Pasted draft'))
  } finally { view.unmount(); vi.unstubAllGlobals() }
})
