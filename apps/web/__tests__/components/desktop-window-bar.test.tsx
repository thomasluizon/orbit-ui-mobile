import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import { renderToString } from 'react-dom/server'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { DesktopWindowBar } from '@/components/desktop-window-bar'
import { DESKTOP_MAXIMIZE_HOVER_EVENT } from '@/lib/desktop-window'

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException: (error: unknown) => captureException(error) }))

const invoke = vi.fn()
let maximized = false

function markShell(platform: string | null) {
  if (platform === null) document.documentElement.removeAttribute('data-desktop-window-bar')
  else document.documentElement.setAttribute('data-desktop-window-bar', platform)
}

function renderBar(locale: 'en' | 'pt-BR' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <DesktopWindowBar />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  maximized = false
  invoke.mockReset()
  invoke.mockImplementation(async (_command: string, payload: { action: string }) => {
    if (payload.action === 'toggle_maximize') maximized = !maximized
    return maximized
  })
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
})
afterEach(() => {
  cleanup()
  markShell(null)
  vi.unstubAllGlobals()
  captureException.mockReset()
})

it('renders nothing in a browser tab or in a shell that keeps its native title bar', () => {
  const { container } = renderBar()
  expect(container).toBeEmptyDOMElement()
  expect(invoke).not.toHaveBeenCalled()
  markShell('linux')
  cleanup()
  expect(renderBar().container).toBeEmptyDOMElement()
})

it('renders nothing on the server, so the first client render matches it', () => {
  markShell('windows')
  expect(renderToString(
    <NextIntlClientProvider locale="en" messages={en}><DesktopWindowBar /></NextIntlClientProvider>,
  )).toBe('')
})

it.each([
  ['en', ['Minimize', 'Maximize', 'Close'], 'Window controls', 'Menu'],
  ['pt-BR', ['Minimizar', 'Maximizar', 'Fechar'], 'Controles da janela', 'Menu'],
] as const)('draws the menu action and the three Windows actions with %s accessible names', async (locale, names, group, menu) => {
  markShell('windows')
  const { container } = renderBar(locale)
  const controls = screen.getByRole('group', { name: group })
  expect(within(controls).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(names)
  const buttons = within(container).getAllByRole('button')
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([menu, ...names])
  expect(buttons[0]).toHaveAttribute('aria-haspopup', 'menu')
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('desktop_window', { action: 'state' }))
})

it('opens the native app menu from the menu action at the start of the bar, by pointer or by keyboard', async () => {
  markShell('windows')
  const { container } = renderBar()
  const menu = screen.getByRole('button', { name: 'Menu' })
  const bar = container.querySelector('[data-desktop-window-bar-content]') as HTMLElement
  expect(bar.firstElementChild?.contains(menu)).toBe(true)
  expect(bar.style.paddingInlineStart).toBe('4px')
  expect(menu.tabIndex).toBe(0)
  fireEvent.mouseDown(menu, { button: 0, detail: 1 })
  expect(invoke).not.toHaveBeenCalledWith('desktop_window', { action: 'drag' })
  fireEvent.click(menu)
  expect(invoke).toHaveBeenLastCalledWith('desktop_window', { action: 'menu' })
  const user = userEvent.setup()
  for (const key of ['{Enter}', ' ']) {
    invoke.mockClear()
    menu.focus()
    await user.keyboard(key)
    expect(invoke).toHaveBeenCalledWith('desktop_window', { action: 'menu' })
  }
})

it('calls the window command of each action and swaps the maximize glyph and name with the window state', async () => {
  markShell('windows')
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(invoke).toHaveBeenLastCalledWith('desktop_window', { action: 'minimize' })
  fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
  expect(invoke).toHaveBeenLastCalledWith('desktop_window', { action: 'toggle_maximize' })
  const restore = await screen.findByRole('button', { name: 'Restore' })
  expect(restore.querySelector('svg')?.getAttribute('class')).toContain('tabler-icon-squares')
  fireEvent.click(restore)
  expect(await screen.findByRole('button', { name: 'Maximize' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(invoke).toHaveBeenLastCalledWith('desktop_window', { action: 'close' })
})

it('reads the window state again when the window resizes, for a snap or a Win+arrow change', async () => {
  markShell('windows')
  renderBar()
  await screen.findByRole('button', { name: 'Maximize' })
  maximized = true
  act(() => { window.dispatchEvent(new Event('resize')) })
  expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument()
})

it('drags on a single press and toggles maximize on a double press of the bar, never from a button', async () => {
  markShell('windows')
  const { container } = renderBar()
  await screen.findByRole('button', { name: 'Maximize' })
  const dragArea = container.querySelector('[data-desktop-window-bar-content] > [role="presentation"]') as HTMLElement
  fireEvent.mouseDown(dragArea, { button: 0, detail: 1 })
  expect(invoke).toHaveBeenLastCalledWith('desktop_window', { action: 'drag' })
  fireEvent.mouseDown(dragArea, { button: 0, detail: 2 })
  expect(invoke).toHaveBeenLastCalledWith('desktop_window', { action: 'toggle_maximize' })
  invoke.mockClear()
  fireEvent.mouseDown(dragArea, { button: 2, detail: 1 })
  fireEvent.mouseDown(screen.getByRole('button', { name: /Maximize|Restore/ }), { button: 0, detail: 1 })
  expect(invoke).not.toHaveBeenCalledWith('desktop_window', { action: 'drag' })
})

it('shows the hover fill on the maximize action while the native snap region holds the pointer', async () => {
  markShell('windows')
  renderBar()
  const maximize = await screen.findByRole('button', { name: 'Maximize' })
  expect(maximize).not.toHaveAttribute('data-native-hover')
  act(() => { window.dispatchEvent(new CustomEvent(DESKTOP_MAXIMIZE_HOVER_EVENT, { detail: true })) })
  expect(maximize).toHaveAttribute('data-native-hover', 'true')
  act(() => { window.dispatchEvent(new CustomEvent(DESKTOP_MAXIMIZE_HOVER_EVENT, { detail: false })) })
  expect(maximize).not.toHaveAttribute('data-native-hover')
})

it('keeps the macOS traffic lights clear and draws no window actions and no menu action, as macOS keeps its menu bar', () => {
  markShell('macos')
  const { container } = renderBar()
  expect(screen.queryAllByRole('button')).toEqual([])
  const bar = container.querySelector('[data-desktop-window-bar-content]') as HTMLElement
  expect(bar.style.paddingInlineStart).toBe('80px')
})

it('reports a failed window command instead of swallowing it', async () => {
  markShell('windows')
  invoke.mockRejectedValue(new Error('window refused'))
  renderBar()
  await waitFor(() => expect(captureException).toHaveBeenCalledWith(new Error('window refused')))
})
