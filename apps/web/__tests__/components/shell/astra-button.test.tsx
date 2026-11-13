import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AstraButton } from '@/components/shell/astra-button'
import { ShellWide } from '@/components/shell/shell-wide'
import { useUIStore } from '@/stores/ui-store'

vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))

beforeEach(() => { localStorage.clear(); useUIStore.setState(useUIStore.getInitialState()) })

function mount({ messages = en, fab = true, fabPending = false }: { messages?: typeof en; fab?: boolean; fabPending?: boolean } = {}) {
  const create: ReactNode = fab ? <button type="button">Create</button> : undefined
  return render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
    <ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: () => {} }}
      tabBar={<nav>Tabs</nav>} astraButton={<AstraButton />} fab={create} fabPending={fabPending}><div>Habits</div></ShellWide>
  </NextIntlClientProvider>)
}

function openButton(messages = en) { return screen.getByRole('button', { name: messages.shell.astraButton.open }) }

it.each([en, ptBR])('opens Astra with its localized name and no move description', async messages => {
  const user = userEvent.setup()
  mount({ messages })
  const button = openButton(messages)
  expect(button).not.toHaveAttribute('aria-describedby')
  expect(button).not.toHaveAttribute('title')
  await user.click(button)
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('opens the conversation from the keyboard', async () => {
  const user = userEvent.setup()
  mount()
  openButton().focus()
  await user.keyboard('{Enter}')
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('renders in the create button column, directly before the create button', () => {
  mount()
  const column = document.querySelector('[data-shell-fab-content]')!
  const astra = column.querySelector('[data-shell-astra-button] [data-astra-button]')
  const create = column.querySelector('[data-shell-fab] button')
  expect(astra).toBe(openButton())
  expect(create).toHaveTextContent('Create')
  expect(astra!.compareDocumentPosition(create!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(document.querySelectorAll('[data-astra-button]')).toHaveLength(1)
})

it('keeps the column when the create button is absent, so the conversation entry takes its place', () => {
  mount({ fab: false })
  expect(document.querySelector('[data-shell-fab]')).toBeNull()
  expect(document.querySelector('[data-shell-fab-content] [data-astra-button]')).toBe(openButton())
})

it('stays in its column through a drag, a long press and the arrow keys, and stores no position', async () => {
  vi.useFakeTimers()
  try {
    mount()
    const button = openButton()
    const parent = button.parentElement
    fireEvent.pointerDown(button, { button: 0, clientX: 350, clientY: 460 })
    fireEvent.pointerMove(button, { clientX: 40, clientY: 40 })
    await act(() => vi.advanceTimersByTimeAsync(800))
    fireEvent.pointerUp(button, { clientX: 40, clientY: 40 })
    fireEvent.contextMenu(button)
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) fireEvent.keyDown(button, { key })
    expect(openButton()).toBe(button)
    expect(button.parentElement).toBe(parent)
    expect(button).not.toHaveAttribute('style', expect.stringContaining('translate'))
    expect(parent).not.toHaveAttribute('style')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(Object.keys(localStorage).filter(key => key.includes('astra'))).toEqual([])
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  } finally { vi.useRealTimers() }
})

it('withholds the button while a sheet or selection owns the surface', async () => {
  mount()
  await act(() => useUIStore.setState({ isSelectMode: true }))
  expect(screen.queryByRole('button', { name: en.shell.astraButton.open })).toBeNull()
  await act(() => useUIStore.setState({ isSelectMode: false, openOverlayIds: ['sheet'] }))
  expect(screen.queryByRole('button', { name: en.shell.astraButton.open })).toBeNull()
  const hidden = document.querySelector('[data-astra-button]')
  await act(() => useUIStore.setState({ openOverlayIds: [] }))
  expect(openButton()).toBeVisible()
  expect(openButton()).toBe(hidden)
})

it('holds the pending create button slot with a hidden spacer that takes no focus or press', async () => {
  const user = userEvent.setup()
  mount({ fab: false, fabPending: true })
  const slot = document.querySelector<HTMLElement>('[data-shell-fab-content] [data-shell-fab-pending]')!
  expect(slot).toHaveAttribute('aria-hidden', 'true')
  expect(slot).toHaveAttribute('inert')
  expect(slot.querySelectorAll('*')).toHaveLength(0)
  expect(openButton().compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.tab()
  expect(document.activeElement).not.toBe(slot)
  expect(screen.getAllByRole('button').filter(button => slot.contains(button))).toEqual([])
})

it('is the live Orbit at 48 with no circle, fill or border, in a 60 press target', () => {
  mount()
  const button = openButton()
  const mascot = button.querySelector('svg')!
  expect(mascot).toHaveAttribute('data-orbit-face', 'rig')
  expect(mascot).toHaveAttribute('width', '48')
  expect(mascot).toHaveAttribute('aria-hidden', 'true')
  expect(button).toHaveStyle({ width: '60px', height: '60px' })
  expect(button).toHaveClass('bg-transparent', 'border-0', 'motion-safe:active:scale-[0.96]')
  expect(button).not.toHaveAttribute('data-fab')
  expect(button.querySelector('[data-press-fill]')).toBeNull()
})

it('scales the conversation entry to 0.96 on the press tokens only when motion is allowed', () => {
  mount()
  const button = openButton()
  expect(button.className).toContain('[transition-duration:var(--dur-press)]')
  expect(button.className).toContain('transition-[scale]')
  expect(button.className.split(' ').filter(name => name.includes('scale-[0.96]'))).toEqual(['motion-safe:active:scale-[0.96]'])
})
