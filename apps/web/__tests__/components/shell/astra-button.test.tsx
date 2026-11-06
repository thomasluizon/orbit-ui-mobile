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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-astra-button')) {
      const [x = 0, y = 0] = [...this.parentElement!.style.transform.matchAll(/(-?\d+)px/g)].map(match => Number(match[1]))
      return { x, y, left: x, top: y, right: x + 60, bottom: y + 60, width: 60, height: 60, toJSON: () => ({}) }
    }
    if (this.hasAttribute('data-shell-tab-bar')) return { x: 0, y: height, left: 0, top: height, right: width, bottom: height + 80, width, height: 80, toJSON: () => ({}) }
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
  return render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}><div><div data-shell-page=""><div data-shell-page-content="" /></div><div data-shell-tab-bar="" /><AstraButton /></div></NextIntlClientProvider>)
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
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.pointerDown(button, { button: 0, clientX: 350, clientY: 460 })
  expect(button).not.toHaveAttribute('data-lifted')
  fireEvent.pointerMove(button, { clientX: 110, clientY: 260 })
  expect(button).toHaveAttribute('data-lifted')
  fireEvent.pointerUp(button, { clientX: 110, clientY: 260 })
  expect(button).not.toHaveAttribute('data-lifted')
  fireEvent.click(button, { detail: 1 })
  expect(placement().style.transform).toBe('translate(16px, 240px)')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  expect(JSON.parse(localStorage.getItem(ASTRA_POSITION_KEY)!)).toEqual({ x: 16, y: 240 })
  view.unmount()
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(16px, 240px)'))
  const restored = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.pointerDown(restored, { button: 0, clientX: 25, clientY: 260 })
  fireEvent.pointerUp(restored, { clientX: 26, clientY: 261 })
  fireEvent.click(restored, { detail: 1 })
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('moves with arrow keys and resets an outgrown position when its window shrinks', async () => {
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.keyDown(button, { key: 'ArrowUp' })
  expect(placement().style.transform).toBe('translate(336px, 364px)')
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  act(() => { width = 320; height = 400; resize() })
  expect(placement().style.transform).toBe('translate(244px, 240px)')
  expect(JSON.parse(localStorage.getItem(ASTRA_POSITION_KEY)!)).toEqual({ x: 244, y: 240 })
})

it('places the initial button immediately and animates only a requested snap', async () => {
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  expect(placement().style.transitionDuration).toBe('0ms')
  fireEvent.keyDown(screen.getByRole('button', { name: en.shell.astraButton.open }), { key: 'ArrowUp' })
  expect(placement().style.transitionDuration).toBe('')
})

it('withholds the button while a sheet or selection owns the surface', async () => {
  mount()
  act(() => useUIStore.getState().registerOpenOverlay('sheet'))
  expect(screen.queryByRole('button')).toBeNull()
  act(() => useUIStore.getState().unregisterOpenOverlay('sheet'))
  expect(screen.getByRole('button')).toBeVisible()
  act(() => { useUIStore.setState({ isSelectMode: true }) })
  expect(screen.queryByRole('button')).toBeNull()
})

it('retains its opening control through a temporarily unavailable placement', async () => {
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  act(() => { useUIStore.setState({ astraConversationOpen: true }); height = 0; resize() })
  expect(button.isConnected).toBe(true)
  expect(button).not.toBeVisible()
  act(() => { height = 600; resize(); useUIStore.setState({ astraConversationOpen: false }) })
  expect(screen.getByRole('button', { name: en.shell.astraButton.open })).toBe(button)
})

it('moves through a single-pointer action without dragging or opening Astra', async () => {
  const user = userEvent.setup()
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  act(() => button.focus())
  fireEvent.contextMenu(button)
  await user.click(await screen.findByRole('button', { name: en.shell.astraButton.left }))
  await waitFor(() => expect(placement().style.transform).toBe('translate(16px, 440px)'))
  expect(JSON.parse(localStorage.getItem(ASTRA_POSITION_KEY)!)).toEqual({ x: 16, y: 440 })
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('offers movement after a held pointer and suppresses its opening click', async () => {
  const user = userEvent.setup()
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  const button = screen.getByRole('button', { name: en.shell.astraButton.open })
  fireEvent.pointerDown(button, { button: 0, clientX: 350, clientY: 460 })
  const move = await screen.findByRole('button', { name: en.shell.astraButton.up })
  fireEvent.pointerUp(button, { clientX: 350, clientY: 460 })
  fireEvent.click(button, { detail: 1 })
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  await user.click(move)
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 364px)'))
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
})

it('reserves end-of-list clearance on the page from its current position', async () => {
  mount()
  await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
  const page = document.querySelector<HTMLElement>('[data-shell-page]')!
  expect(page.style.getPropertyValue('--shell-astra-clearance')).toBe('176px')
  fireEvent.keyDown(screen.getByRole('button', { name: en.shell.astraButton.open }), { key: 'ArrowUp' })
  expect(page.style.getPropertyValue('--shell-astra-clearance')).toBe('252px')
  act(() => useUIStore.getState().registerOpenOverlay('sheet'))
  expect(page.style.getPropertyValue('--shell-astra-clearance')).toBe('0px')
})

it('stops measuring without an error once it leaves the shell', async () => {
  const errors: unknown[] = []
  const record = (event: ErrorEvent) => { errors.push(event.error); event.preventDefault() }
  window.addEventListener('error', record)
  try {
    mount()
    await waitFor(() => expect(placement().style.transform).toBe('translate(336px, 440px)'))
    document.querySelector('[data-astra-button-area]')!.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(errors).toEqual([])
  } finally { window.removeEventListener('error', record) }
})
