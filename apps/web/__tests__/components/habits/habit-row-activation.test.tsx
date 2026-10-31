import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

beforeEach(() => vi.spyOn(document, 'hasFocus').mockReturnValue(true))
afterEach(() => vi.restoreAllMocks())

function renderRow(selectMode = false) {
  const actions = { onDetail: vi.fn(), onToggleSelection: vi.fn() }
  const { container } = render(<HabitRow habit={createMockHabit({ title: 'Read' })} selectMode={selectMode} actions={actions} />)
  const body = container.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
  return { body, actions, primary: selectMode ? actions.onToggleSelection : actions.onDetail }
}

function leaveAndReturn(hidden: boolean) {
  fireEvent(window, new Event('blur'))
  if (hidden) {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
  }
  fireEvent(window, new Event('focus'))
}

describe.each([false, true])('habit row activation, selecting=%s', (selectMode) => {
  it('accepts the first focused tap without waiting for a window focus event', async () => {
    const { body, primary } = renderRow(selectMode)
    await userEvent.setup().click(body)
    expect(primary).toHaveBeenCalledOnce()
  })

  it('accepts a new focused press when the window focus event was missed', async () => {
    const { body, actions, primary } = renderRow(selectMode)
    fireEvent(window, new Event('blur'))
    await userEvent.setup().click(body)
    expect(primary).toHaveBeenCalledOnce()
    expect(selectMode ? actions.onDetail : actions.onToggleSelection).not.toHaveBeenCalled()
  })

  it.each(['Enter', ' '])('rejects %s when mounted in an unfocused window', (key) => {
    vi.mocked(document.hasFocus).mockReturnValue(false)
    const { body, primary } = renderRow(selectMode)
    body.focus()
    fireEvent.keyDown(body, { key })
    fireEvent.keyUp(body, { key })
    expect(primary).not.toHaveBeenCalled()
  })

  it.each(['Enter', ' '])('accepts a fresh %s after focus returns without a window focus event', (key) => {
    vi.mocked(document.hasFocus).mockReturnValue(false)
    const { body, primary } = renderRow(selectMode)
    body.focus()
    vi.mocked(document.hasFocus).mockReturnValue(true)
    fireEvent.keyDown(body, { key })
    fireEvent.keyUp(body, { key })
    expect(primary).toHaveBeenCalledOnce()
  })

  it('keeps accessibility activation available without pointer events', () => {
    const { body, primary } = renderRow(selectMode)
    fireEvent.click(body, { detail: 0 })
    expect(primary).toHaveBeenCalledOnce()
  })

  it('names the programmatic row focus target without replacing its independent actions', () => {
    const { body } = renderRow(selectMode)
    const row = body.closest<HTMLElement>('[data-testid="habit-row"]')!
    expect(row).toHaveRole('group')
    expect(row).toHaveAccessibleName('Read')
    row.focus()
    expect(row).toHaveFocus()
    expect(body).toHaveRole('button')
    expect(body).toHaveAccessibleName(/Read/)
  })

  it.each([false, true])('discards a press across focus loss, hidden=%s', async (hidden) => {
    const user = userEvent.setup()
    const { body, actions, primary } = renderRow(selectMode)
    await user.pointer({ target: body, keys: '[MouseLeft>]' })
    leaveAndReturn(hidden)
    await user.pointer({ target: body, keys: '[/MouseLeft]' })
    expect(actions.onDetail).not.toHaveBeenCalled()
    expect(actions.onToggleSelection).not.toHaveBeenCalled()
    await user.click(body)
    expect(primary).toHaveBeenCalledOnce()
    expect(selectMode ? actions.onDetail : actions.onToggleSelection).not.toHaveBeenCalled()
  })

  it('discards a cancelled press and an orphan click', async () => {
    const { body, primary } = renderRow(selectMode)
    const user = userEvent.setup()
    await user.pointer({ target: body, keys: '[MouseLeft>]' })
    fireEvent.pointerCancel(body)
    await user.pointer({ target: body, keys: '[/MouseLeft]' })
    fireEvent.click(body, { detail: 1 })
    expect(primary).not.toHaveBeenCalled()
    await user.click(body)
    expect(primary).toHaveBeenCalledOnce()
  })

  it('cancels on visibility loss without a window blur', async () => {
    const { body, primary } = renderRow(selectMode)
    const user = userEvent.setup()
    await user.pointer({ target: body, keys: '[MouseLeft>]' })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    await user.pointer({ target: body, keys: '[/MouseLeft]' })
    expect(primary).not.toHaveBeenCalled()
    await user.click(body)
    expect(primary).toHaveBeenCalledOnce()
  })

  it('uses a first click to restore window focus without opening the row', async () => {
    const { body, primary } = renderRow(selectMode)
    const user = userEvent.setup()
    fireEvent(window, new Event('blur'))
    vi.mocked(document.hasFocus).mockReturnValue(false)
    await user.pointer({ target: body, keys: '[MouseLeft>]' })
    fireEvent(window, new Event('focus'))
    vi.mocked(document.hasFocus).mockReturnValue(true)
    await user.pointer({ target: body, keys: '[/MouseLeft]' })
    expect(primary).not.toHaveBeenCalled()
    await user.click(body)
    expect(primary).toHaveBeenCalledOnce()
  })

  it.each(['Enter', ' '])('rejects interrupted %s and accepts a fresh focused activation', async (key) => {
    const { body, actions, primary } = renderRow(selectMode)
    body.focus()
    fireEvent.keyDown(body, { key: ' ' })
    leaveAndReturn(true)
    fireEvent.keyUp(body, { key })
    fireEvent.click(body, { detail: 0 })
    expect(actions.onDetail).not.toHaveBeenCalled()
    expect(actions.onToggleSelection).not.toHaveBeenCalled()
    await userEvent.setup().keyboard(key === 'Enter' ? '{Enter}' : ' ')
    expect(primary).toHaveBeenCalledOnce()
    expect(selectMode ? actions.onDetail : actions.onToggleSelection).not.toHaveBeenCalled()
  })

  it.each(['Alt', 'Meta', 'Tab'])('ignores a leftover %s key release', (key) => {
    const { body, primary } = renderRow(selectMode)
    body.focus()
    leaveAndReturn(false)
    fireEvent.keyUp(body, { key })
    expect(primary).not.toHaveBeenCalled()
  })

  it('activates once when Space is held through repeated keydowns', () => {
    const { body, primary } = renderRow(selectMode)
    body.focus()
    fireEvent.keyDown(body, { key: ' ' })
    fireEvent.keyDown(body, { key: ' ', repeat: true })
    fireEvent.keyUp(body, { key: ' ' })
    expect(primary).toHaveBeenCalledOnce()
  })
})

it('retains the drag description and reorder shortcuts without opening detail', () => {
  const onDetail = vi.fn()
  const onReorder = vi.fn()
  const { container } = render(<HabitRow habit={createMockHabit({ title: 'Read' })}
    actions={{ onDetail, onReorder }} reorderInstructionsId="reorder-instructions" />)
  const body = container.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
  expect(body).toHaveAttribute('aria-roledescription', 'dragAndDrop.roleDescription')
  expect(body).toHaveAttribute('aria-describedby', 'reorder-instructions')
  expect(body).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
  body.focus()
  fireEvent.keyDown(body, { key: 'ArrowUp', altKey: true })
  fireEvent.keyDown(body, { key: 'ArrowDown', altKey: true })
  expect(onReorder.mock.calls).toEqual([[-1], [1]])
  expect(onDetail).not.toHaveBeenCalled()
})
