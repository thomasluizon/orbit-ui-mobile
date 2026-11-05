import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ASTRA_POSITION_KEY } from '@orbit/shared/utils'
import { AstraButton } from '@/components/shell/astra-button'
import { useUIStore } from '@/stores/ui-store'

let width = 412
let height = 600
let resize: () => void

beforeEach(() => {
  width = 412
  height = 600
  localStorage.clear()
  useUIStore.setState(useUIStore.getInitialState())
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
  })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  })
  HTMLElement.prototype.setPointerCapture = vi.fn()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function mount(messages = en) {
  return render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}><div><AstraButton /></div></NextIntlClientProvider>)
}
function placement() { return document.querySelector<HTMLElement>('[data-astra-button-position]')! }

it.each([en, ptBR])('opens Astra with its localized name in the ordinary keyboard order', async messages => {
  const user = userEvent.setup()
  mount(messages)
  await user.tab()
  const button = screen.getByRole('button', { name: messages.shell.astraButton.open })
  expect(button).toHaveFocus()
  expect(button).toHaveAccessibleDescription(messages.shell.astraButton.keyboardHint)
  await user.keyboard('{Enter}')
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('drags, snaps and persists without opening, then accepts a tap', async () => {
  const view = mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 448px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.pointerDown(button, { button: 0, clientX: 350, clientY: 460 })
  fireEvent.pointerMove(button, { clientX: 110, clientY: 260 })
  fireEvent.pointerUp(button, { clientX: 110, clientY: 260 })
  fireEvent.click(button, { detail: 1 })
  expect(placement().style.transform).toBe('translate(16px, 248px)')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  expect(JSON.parse(localStorage.getItem(ASTRA_POSITION_KEY)!)).toEqual({ x: 16, y: 248 })
  view.unmount()
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(16px, 248px)'))
  const restored = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.pointerDown(restored, { button: 0, clientX: 25, clientY: 260 })
  fireEvent.pointerUp(restored, { clientX: 26, clientY: 261 })
  fireEvent.click(restored, { detail: 1 })
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('moves with arrow keys and resets an outgrown position when its window shrinks', async () => {
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 448px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.keyDown(button, { key: 'ArrowUp' })
  expect(placement().style.transform).toBe('translate(336px, 372px)')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  await act(() => { width = 320; height = 400; resize() })
  expect(placement().style.transform).toBe('translate(244px, 248px)')
})

it('withholds the button while a sheet or selection owns the surface', async () => {
  mount()
  act(() => useUIStore.getState().registerOpenOverlay('sheet'))
  expect(screen.queryByRole('button')).toBeNull()
  act(() => useUIStore.getState().unregisterOpenOverlay('sheet'))
  expect(screen.getByRole('button')).toBeVisible()
  act(() => useUIStore.setState({ isSelectMode: true }))
  expect(screen.queryByRole('button')).toBeNull()
})
