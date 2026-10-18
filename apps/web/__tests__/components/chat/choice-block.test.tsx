import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { choiceBlockFixture, pickListBlockFixture } from '@orbit/shared/test-support/chat-fixtures'
import type { BlockAnswerInteraction } from '@orbit/shared/chat'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'

const words = pt.chat.choice
function interaction(overrides: Partial<BlockAnswerInteraction> = {}): BlockAnswerInteraction {
  return { isOnline: true, isSending: false, atMessageLimit: false, allowance: 5, send: vi.fn(async () => ({ ok: true as const })), ...overrides }
}
function choice(context = interaction(), multiSelect = false, expired = false) {
  return <NextIntlClientProvider locale="pt-BR" messages={pt}><ChoiceBlock block={{ ...choiceBlockFixture, multiSelect }} interaction={context} expired={expired} /></NextIntlClientProvider>
}
afterEach(cleanup)

describe('choice and pick list answers', () => {
  it('roves and selects with arrows, then sends once on Enter and focuses the localized answer', async () => {
    const context = interaction()
    render(choice(context))
    const radios = screen.getAllByRole('radio')
    expect(radios.map(row => row.tabIndex)).toEqual([0, -1, -1])
    radios[0]!.focus()
    fireEvent.keyDown(radios[0]!, { key: 'ArrowUp' })
    expect(radios[2]).toHaveFocus()
    expect(radios[2]).toHaveAttribute('aria-checked', 'true')
    expect(radios.map(row => row.tabIndex)).toEqual([-1, -1, 0])
    expect(context.send).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(radios[2]!, { key: 'Enter' }) })
    expect(context.send).toHaveBeenCalledExactlyOnceWith({ kind: 'choice', answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['evening'] }, labels: [choiceBlockFixture.options[2]!.label] })
    expect(screen.getByText(`Você escolheu ${choiceBlockFixture.options[2]!.label}`).parentElement).toHaveFocus()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
  it('keeps each checkbox in the tab order and requires a selection', async () => {
    const context = interaction()
    render(choice(context, true))
    expect(screen.getByRole('button', { name: words.submit })).toBeDisabled()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.map(row => row.tabIndex)).toEqual([0, 0, 0])
    fireEvent.click(checkboxes[0]!)
    fireEvent.click(checkboxes[2]!)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: words.submit })) })
    expect(context.send).toHaveBeenCalledWith(expect.objectContaining({ answer: { blockId: choiceBlockFixture.blockId, selectedIds: ['morning', 'evening'] } }))
    expect(screen.getByText(`Você escolheu ${choiceBlockFixture.options[0]!.label} e ${choiceBlockFixture.options[2]!.label}`)).toBeInTheDocument()
  })
  it('disables every control while acting and ignores a double press', async () => {
    let finish!: (value: { ok: true }) => void
    const send = vi.fn(() => new Promise<{ ok: true }>(resolve => { finish = resolve }))
    render(choice(interaction({ send })))
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    const submit = screen.getByRole('button', { name: words.submit })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(send).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText(words.freeText)).toBeDisabled()
    expect(screen.getAllByRole('radio').every(row => row.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(submit).toBeDisabled()
    await act(async () => { finish({ ok: true }) })
  })
  it.each([404, 409, 410, 400, 500])('handles server status %s locally', async status => {
    render(choice(interaction({ send: vi.fn(async () => ({ ok: false, status })) })))
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: words.submit })) })
    if (status === 400 || status === 500) {
      expect(screen.getByRole('alert')).toHaveTextContent(status === 400 ? words.invalid : words.error)
      expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByRole('button', { name: words.submit })).toBeEnabled()
    } else expect(screen.getByText(status === 409 ? words.alreadyAnswered : words.closed)).toBeInTheDocument()
  })
  it('closes when a later message appears and announces the terminal line', () => {
    const context = interaction()
    const { container, rerender } = render(choice(context))
    rerender(choice(context, false, true))
    expect(screen.getByText(words.closed).parentElement).toHaveFocus()
    expect(container.querySelector('[aria-live="polite"]')).toBeNull()
  })
  it('keeps offline selection and gates choice at the message limit', () => {
    const context = interaction()
    const { rerender } = render(choice(context))
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    rerender(choice({ ...context, isOnline: false }))
    expect(screen.getByText(words.offline)).toBeInTheDocument()
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: words.submit })).toBeDisabled()
    rerender(choice({ ...context, atMessageLimit: true }))
    expect(screen.getByText('Você usou suas 5 mensagens de hoje.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: words.submit })).toBeDisabled()
  })
  it('reviews precisely two proposed items even at the message limit', async () => {
    const context = interaction({ atMessageLimit: true })
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PickListBlock block={pickListBlockFixture} interaction={context} /></NextIntlClientProvider>)
    expect(container.querySelectorAll('[data-proposed]')).toHaveLength(4)
    const rows = screen.getAllByRole('checkbox')
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[2]!)
    expect(container.querySelectorAll('[data-proposed]')).toHaveLength(2)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: words.review })) })
    expect(context.send).toHaveBeenCalledExactlyOnceWith({ kind: 'pickList', answer: { blockId: pickListBlockFixture.blockId, selectedIds: ['1', '3'] }, labels: [pickListBlockFixture.items[0]!.label, pickListBlockFixture.items[2]!.label] })
  })
  it('offers a labeled free answer capped at 500 characters', async () => {
    const context = interaction()
    render(choice(context))
    const input = screen.getByLabelText(words.freeText)
    expect(input).toHaveAttribute('maxlength', '500')
    fireEvent.change(input, { target: { value: 'Outro horário' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: words.submit })) })
    expect(context.send).toHaveBeenCalledWith(expect.objectContaining({ answer: { blockId: choiceBlockFixture.blockId, selectedIds: [], freeText: 'Outro horário' } }))
  })
})

it.each(['single', 'multi', 'pickList'])('announces one acting reason outside the %s controls', async kind => {
  let finish!: (value: { ok: true }) => void
  const context = interaction({ send: vi.fn(() => new Promise<{ ok: true }>(resolve => { finish = resolve })) })
  const { container } = render(kind === 'pickList'
    ? <NextIntlClientProvider locale="pt-BR" messages={pt}><PickListBlock block={pickListBlockFixture} interaction={context} /></NextIntlClientProvider>
    : choice(context, kind === 'multi'))
  fireEvent.click(screen.getAllByRole(kind === 'single' ? 'radio' : 'checkbox')[0]!)
  fireEvent.click(screen.getByRole('button', { name: kind === 'pickList' ? words.review : words.submit }))
  const status = container.querySelector('[aria-live="polite"]')!
  expect(status.querySelector('[role="radio"], [role="checkbox"], button, input')).toBeNull()
  expect(screen.getAllByText(kind === 'pickList' ? 'Preparando a prévia' : words.acting)).toHaveLength(1)
  expect(status).toHaveTextContent(kind === 'pickList' ? 'Preparando a prévia' : words.acting)
  await act(async () => { finish({ ok: true }) })
  expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(0)
})

it('keeps radio positions out of visible copy', () => {
  render(choice())
  expect(screen.queryByText('1 de 3')).not.toBeInTheDocument()
})

it.each(['offline', 'limit'])('shows the current %s reason after a failed answer', async reason => {
  const context = interaction({ send: vi.fn(async () => ({ ok: false, status: 500 })) })
  const { rerender } = render(choice(context))
  fireEvent.click(screen.getAllByRole('radio')[0]!)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: words.submit })) })
  expect(screen.getByRole('alert')).toHaveTextContent(words.error)
  rerender(choice({ ...context, isOnline: reason !== 'offline', atMessageLimit: reason === 'limit' }))
  expect(screen.getByRole('status')).toHaveTextContent(reason === 'offline' ? words.offline : 'Você usou suas 5 mensagens de hoje.')
})

it('opens the full pick-list habit name before selecting it', () => {
  const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={pt}><PickListBlock block={pickListBlockFixture} interaction={interaction()} /></NextIntlClientProvider>)
  const label = pickListBlockFixture.items[0]!.label
  const disclosure = screen.getByRole('button', { name: label })
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(disclosure)
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('checkbox', { name: label })).toHaveAttribute('aria-checked', 'false')
  expect(container.querySelector('[data-personal-text-expanded]')).not.toBeNull()
})
