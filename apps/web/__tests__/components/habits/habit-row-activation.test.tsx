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
})
