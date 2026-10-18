import { useState, useLayoutEffect, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Composer } from '@/components/shell/composer'
import { useChatStore } from '@/stores/chat-store'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useAppToastStore } from '@/stores/app-toast-store'

const media = vi.hoisted(() => ({ width: 1023 }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/lockup', () => ({ Lockup: () => <div>Orbit</div> }))
vi.mock('@/components/ui/pill-button', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/components/ui/pill-button')>(),
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))

import { ShellWide } from '@/components/shell/shell-wide'

const items = [
  { id: 'hoje', href: '/', label: 'Hoje', icon: 'hoje' },
  { id: 'calendario', href: '/calendar', label: 'Calendário', icon: 'calendario' },
  { id: 'progresso', href: '/progress', label: 'Progresso', icon: 'progresso' },
  { id: 'perfil', href: '/profile', label: 'Perfil', icon: 'perfil' },
]

function BlurFocusedElement() {
  useLayoutEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])
  return null
}

describe('ShellWide', () => {
  beforeEach(() => {
    media.width = 1023
    useAppToastStore.setState({ currentToast: null, queue: [] })
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: media.width >= Number(query.match(/min-width: (\d+)px/)?.[1]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
  })

  it.each([412, 1000])('closes the compact composer menu at the wide breakpoint from %ipx and focuses Astra without losing the draft', async (width) => {
    media.width = width
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() { return media.width >= Number(query.match(/min-width: (\d+)px/)?.[1]) },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    }))
    useChatStore.getState().setDraft('')
    const onChangeValue = vi.fn((value: string) => useChatStore.getState().setDraft(value))
    const onSend = vi.fn()
    const onVoice = vi.fn()
    const onAttachFile = vi.fn()
    const onAttachImage = vi.fn()
    function DraftComposer() {
      const draft = useChatStore(state => state.draft)
      return <Composer state="idle" value={draft} onChangeValue={onChangeValue} onSend={onSend} suggestions={[]}
        words={{ placeholder: 'Ask Astra', send: 'Send', actions: 'Attach', suggestionsLabel: 'Suggestions' }}
        onAttachFile={onAttachFile} onAttachImage={onAttachImage}
        attachWords={{ file: 'Document', image: 'Photo', trayLabel: 'Attachments', remove: name => `Remove ${name}` }}
        onVoice={onVoice} voiceWords={{ start: 'Voice', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' }} />
    }
    render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={items} activeId="hoje" navLabel="Main navigation"
      compactComposer={<DraftComposer />}
      tabBar={<nav>Tabs</nav>}><h1>Today</h1></ShellWide>)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Keep this draft' } })
    expect(onChangeValue).toHaveBeenCalledExactlyOnceWith('Keep this draft')
    onChangeValue.mockClear()
    const trigger = screen.getByRole('button', { name: 'Attach' })
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const menu = await screen.findByRole('menu', { name: 'Attach' })
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Photo', 'Document', 'Voice'])
    act(() => { media.width = 1100; listeners.forEach(listener => listener()) })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Astra' })).toHaveFocus())
    expect(document.querySelectorAll('[data-shell-pinned-slot] [data-composer-root]')).toHaveLength(0)
    expect(document.querySelector('[data-shell-bottom]')).not.toContainElement(input)
    expect(document.querySelectorAll('[data-composer-root]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-shell-pinned-slot]')).toHaveLength(0)
    expect(input).not.toBeInTheDocument()
    act(() => { media.width = width; listeners.forEach(listener => listener()) })
    const restoredInput = screen.getByRole('textbox')
    expect(restoredInput).toHaveValue('Keep this draft')
    expect(restoredInput).not.toBe(input)
    const restoredTrigger = screen.getByRole('button', { name: 'Attach' })
    expect(restoredTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    act(() => restoredTrigger.focus())
    fireEvent.click(restoredTrigger)
    await screen.findByRole('menu', { name: 'Attach' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(restoredTrigger).toHaveFocus())
    for (const callback of [onChangeValue, onSend, onVoice, onAttachFile, onAttachImage]) expect(callback).not.toHaveBeenCalled()
  })

  it('hosts the pill below the header outside the scroller and suppresses it during conversation', () => {
    const shell = (conversation?: ReactNode) => <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={items} activeId="hoje" navLabel="Main navigation"
      header={<div>Header</div>} tabBar={<nav>Tabs</nav>} fab={<button type="button">Create</button>}
      scrollToTop={<button type="button">Top</button>}
      conversation={conversation} conversationLabel="Conversation"><h1>Today</h1></ShellWide>
    const { container, rerender } = render(shell())
    const slot = container.querySelector<HTMLElement>('[data-shell-scroll-to-top]')!
    const scroller = container.querySelector<HTMLElement>('[data-shell-scroller]')!
    expect(slot.parentElement).toBe(scroller.parentElement)
    expect(slot.parentElement?.previousElementSibling).toBe(container.querySelector<HTMLElement>('[data-shell-header]'))
    expect(scroller).not.toContainElement(slot)
    expect(container.querySelector<HTMLElement>('[data-shell-bottom]')).not.toContainElement(slot)
    rerender(shell(<button type="button">Reply</button>))
    expect(container.querySelector<HTMLElement>('[data-shell-scroll-to-top]')).toBeNull()
  })

  it('unmounts the compact composer at wide widths while keeping the selection tray', () => {
    media.width = 1352
    const props = { items, activeId: 'hoje', navLabel: 'Navigation', astraRow: { label: 'Astra', onOpen: vi.fn() } }
    const compact = <textarea aria-label="Draft" defaultValue="Retained draft" />
    const view = render(<ShellWide {...props} compactComposer={compact} />)
    expect(screen.queryByLabelText('Draft')).not.toBeInTheDocument()
    expect(view.container.querySelector('[data-shell-pinned-slot]')).toBeNull()
    view.rerender(<ShellWide {...props} composer={<button type="button">Selection</button>} />)
    expect(view.container.querySelector('[data-shell-pinned-slot]')).toContainElement(screen.getByRole('button', { name: 'Selection' }))
    view.rerender(<ShellWide {...props} compactComposer={compact} />)
    expect(view.container.querySelector('[data-shell-pinned-slot]')).toBeNull()
    expect(screen.queryByLabelText('Draft')).not.toBeInTheDocument()
    view.rerender(<ShellWide {...props} activeId="calendario" />)
    expect(view.container.querySelector('[data-shell-pinned-slot]')).toBeNull()
  })

  it('centres compact notice, dock, and FAB inside the full-width bottom chrome', () => {
    media.width = 900
    const { container } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={items} activeId="hoje" navLabel="Main navigation" notice={<div>Notice</div>} composer={<div>Composer</div>} fab={<button type="button">Create</button>} tabBar={<nav>Tabs</nav>} />,
    )
    const bottom = container.querySelector('[data-shell-bottom]')
    const pinnedSlot = container.querySelector('[data-shell-pinned-slot]')
    const column = pinnedSlot?.parentElement ?? null
    expect(column).toHaveStyle({ maxWidth: '740px' })
    expect(column).toContainElement(container.querySelector('[data-shell-notice]'))
    expect(column).toContainElement(container.querySelector('[data-shell-fab]'))
    expect(bottom).toContainElement(column)
    expect(bottom).not.toHaveClass('max-w-[740px]')
    expect(bottom).toHaveClass('pb-[var(--safe-bottom)]')
  })

  it('keeps the wide pinned slot inside the existing content column', () => {
    media.width = 1440
    const { container } = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={items} activeId="hoje" navLabel="Main navigation" composer={<div>Composer</div>} />)
    const column = container.querySelector('[data-shell-scroller]')?.closest('[data-shell-column]')
    expect(column).toHaveStyle({ maxWidth: '740px' })
    expect(column).toContainElement(container.querySelector('[data-shell-pinned-slot]'))
  })

  it('floats the compact FAB without its own band or separator', () => {
    const { container } = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} items={items} activeId="hoje" navLabel="Main navigation" composer={<div>Composer</div>} fab={<button type="button">Create</button>}><h1>Today</h1></ShellWide>)
    const bottom = container.querySelector('[data-shell-bottom]')
    expect(bottom).not.toHaveClass('shadow-[inset_0_1px_0_var(--hairline)]')
    const fab = container.querySelector<HTMLElement>('[data-shell-fab]')
    expect(fab).toContainElement(screen.getByRole('button', { name: 'Create' }))
    expect(container.querySelector('[data-shell-scroller]')).not.toContainElement(fab)
    expect(bottom).toContainElement(fab)
  })

  it('owns the 232px navigation, 740px canvas, notice, and pinned composer', () => {
    const { container } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        notice={<div>Notice</div>}
        composer={<div>Composer</div>}
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    expect(container.querySelector('[data-shell-sidebar]')).toHaveClass('w-[232px]')
    expect(container.querySelector('[data-shell-scroller]')?.closest('[data-shell-column]')).toHaveStyle({ maxWidth: '740px' })
    expect(container.querySelector('[data-shell-notice]')).toHaveTextContent('Notice')
    expect(container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Composer')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
  })

  it('selects sidebar destinations and exposes the active one', () => {
    const onSelect = vi.fn()
    render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="calendario"
        navLabel="Main navigation"
        onSelect={onSelect}
      />,
    )

    const calendar = screen.getByRole('link', { name: 'Calendário' })
    expect(calendar).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/', '/calendar', '/progress', '/profile'])
    calendar.click()
    expect(onSelect).toHaveBeenCalledWith('calendario')
  })

  it('shows the short search entry and the full create action in the sidebar', () => {
    const onPalette = vi.fn()
    render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="hoje"
        navLabel="Navegação principal"
        onPalette={onPalette}
        paletteLabel="Buscar"
        paletteHint="Ctrl K"
        onCreate={() => {}}
        createLabel="Criar hábito"
      />,
    )

    const search = screen.getByRole('button', { name: 'Buscar' })
    expect(search).toHaveTextContent('Buscar')
    expect(within(search).getByText('Ctrl K')).toBeVisible()
    fireEvent.click(search)
    expect(onPalette).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Criar hábito' })).toHaveTextContent('Criar hábito')
  })

  it.each(['dark', 'light'])('keeps navigation colors valid in %s mode', (mode) => {
    document.documentElement.dataset.theme = mode
    render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="calendario"
        navLabel="Main navigation"
        onSelect={() => {}}
      />,
    )

    const active = screen.getByRole('link', { name: 'Calendário' })
    const inactive = screen.getByRole('link', { name: 'Hoje' })
    expect(active).toHaveClass('text-[var(--primary-soft)]')
    expect(active).toHaveClass('hover:text-[var(--primary-text)]')
    expect(active.querySelector('svg')).toHaveAttribute('fill', 'var(--primary)')
    expect(inactive).toHaveClass('text-[var(--fg-3)]')
    expect(inactive.querySelector('svg')).toHaveAttribute('stroke', 'var(--fg-3)')
    delete document.documentElement.dataset.theme
  })

  it('keeps the full account name and email in one profile link with an initial well', () => {
    render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        account="Ada Lovelace"
        accountEmail="ada@example.com"
      />,
    )

    const account = screen.getByRole('link', { name: 'Ada Lovelace, ada@example.com' })
    expect(account).toHaveAttribute('href', '/profile')
    expect(within(account).getByText('ada@example.com')).toBeInTheDocument()
    expect(account.querySelector('[aria-hidden="true"]')).toHaveTextContent('A')
    expect(within(account).queryByRole('button')).not.toBeInTheDocument()
    expect(account.nextElementSibling).toBeNull()
  })

  it('reserves the account row while its profile loads', () => {
    const props = { items, activeId: 'hoje', navLabel: 'Main navigation', onCreate: vi.fn(), createLabel: 'Create' }
    const { container, rerender } = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} />)
    const create = screen.getByRole('button', { name: 'Create' })
    const placeholder = container.querySelector('[data-shell-account]')
    expect(placeholder).toHaveAttribute('data-loading', 'true')
    expect(placeholder).toHaveClass('min-h-[var(--touch-min)]')
    expect(placeholder?.previousElementSibling).toContainElement(create)

    rerender(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} account="Ada Lovelace" />)
    const account = screen.getByRole('link', { name: 'Ada Lovelace' })
    expect(account).toHaveClass('min-h-[var(--touch-min)]')
    expect(account.parentElement?.previousElementSibling).toContainElement(create)
  })

  it('uses a modal conversation overlay below the side-panel breakpoint', () => {
    const { container } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        conversation={<div>Conversation</div>}
        conversationLabel="Astra conversation"
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    expect(screen.getByRole('dialog', { name: 'Astra conversation' })).toHaveAttribute(
      'data-shell-conversation',
      'overlay',
    )
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert')
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps a queued action in the compact conversation dialog', async () => {
    const reload = vi.fn()
    const { container } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        notice={<span>Background notice</span>}
        conversation={<div data-shell-notice=""><AppToastHost /></div>}
        conversationLabel="Astra conversation"
        conversationOpen
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    act(() => { useAppToastStore.getState().showQueued('App updated', 'Reload', reload) })
    await screen.findByText('App updated')
    const dialog = screen.getByRole('dialog', { name: 'Astra conversation' })
    expect(within(dialog).getByRole('status')).toHaveTextContent('App updated')
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert')
    expect(container.querySelector('[data-shell-background]')).not.toHaveTextContent('App updated')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('keeps the sidebar while replacing the destination with the full column conversation', () => {
    media.width = 1024
    const { container } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }}
        items={items}
        activeId="hoje"
        navLabel="Main navigation"
        conversation={<div>Conversation</div>}
        conversationLabel="Astra conversation"
      >
        <h1>Today</h1>
      </ShellWide>,
    )

    expect(container.querySelector('[data-shell-conversation="panel"]')).toBeNull()
    const conversation = screen.getByRole('dialog', { name: 'Astra conversation' })
    expect(within(conversation).getByRole('main')).toBeVisible()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(conversation.closest('[data-shell-column]')).toHaveStyle({ maxWidth: '740px' })
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert')
    expect(container.querySelector('[data-shell-sidebar]')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
    expect(container.querySelector('[data-shell-destination]')).toHaveAttribute('inert')
    expect(container.querySelector('[data-shell-scroller]')).not.toBeVisible()
  })

  it('moves focus into the Support conversation panel and returns it on close', () => {
    media.width = 1024
    const props = {
      items,
      activeId: 'perfil',
      navLabel: 'Main navigation',
      conversation: <><BlurFocusedElement /><button type="button">Close conversation</button></>,
      conversationLabel: 'Astra conversation',
    }
    const { rerender } = render(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} conversationOpen={false}>
        <button type="button">Support</button>
      </ShellWide>,
    )
    const support = screen.getByRole('button', { name: 'Support' })
    fireEvent.click(support)

    rerender(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} conversationOpen>
        <button type="button">Support</button>
      </ShellWide>,
    )
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()

    rerender(
      <ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} conversationOpen={false}>
        <button type="button">Support</button>
      </ShellWide>,
    )
    expect(support).toHaveFocus()
  })

  it.each([true, false])('returns conversation focus to the composer trigger with side panel=%s', (sidePanel) => {
    media.width = sidePanel ? 1024 : 1023
    const props = {
      items,
      activeId: 'hoje',
      navLabel: 'Main navigation',
      composer: <button type="button">Open conversation</button>,
      conversation: <><BlurFocusedElement /><button type="button">Close conversation</button></>,
      conversationLabel: 'Astra conversation',
    }
    const { rerender } = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} conversationOpen={false} />)
    screen.getByRole('button', { name: 'Open conversation' }).focus()

    rerender(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} conversationOpen />)
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Open conversation' })).not.toBeInTheDocument()

    rerender(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} conversationOpen={false} />)
    expect(screen.getByRole('button', { name: 'Open conversation' })).toHaveFocus()
  })

  it.each([true, false])('returns focus to the current destination after its composer disappears with side panel=%s', (sidePanel) => {
    media.width = sidePanel ? 1024 : 1023
    const props = {
      items,
      navLabel: 'Main navigation',
      conversation: <button type="button">Close conversation</button>,
      conversationLabel: 'Astra conversation',
    }
    const { rerender } = render(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} activeId="hoje" conversationOpen={false}
      composer={<button type="button">Open conversation</button>}><h1>Today</h1></ShellWide>)
    screen.getByRole('button', { name: 'Open conversation' }).focus()
    rerender(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} activeId="hoje" conversationOpen
      composer={<button type="button">Open conversation</button>}><h1>Today</h1></ShellWide>)
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()
    rerender(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} activeId="calendario" conversationOpen><h1>Calendar</h1></ShellWide>)
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()
    rerender(<ShellWide astraRow={{ label: 'Astra', onOpen: () => {} }} {...props} activeId="calendario" conversationOpen={false}><h1>Calendar</h1></ShellWide>)
    expect(screen.getByRole('heading', { name: 'Calendar' })).toHaveFocus()
  })

  it.each([true, false])('skips a retained hidden heading when conversation focus returns with side panel=%s', (sidePanel) => {
    media.width = sidePanel ? 1024 : 1023
    const props = {
      items,
      navLabel: 'Main navigation',
      conversation: <button type="button">Close conversation</button>,
      conversationLabel: 'Astra conversation',
      header: <><div hidden><h1>Previous</h1></div><div><h1>Calendar</h1></div></>,
      astraRow: { label: 'Astra', onOpen: () => {} },
      activeId: 'calendario',
    }
    const { rerender } = render(<ShellWide {...props} conversationOpen={false}
      composer={<button type="button">Open conversation</button>}><p>Content</p></ShellWide>)
    screen.getByRole('button', { name: 'Open conversation' }).focus()
    rerender(<ShellWide {...props} conversationOpen><p>Content</p></ShellWide>)
    expect(screen.getByRole('button', { name: 'Close conversation' })).toHaveFocus()
    rerender(<ShellWide {...props} conversationOpen={false}><p>Content</p></ShellWide>)
    expect(screen.getByRole('heading', { name: 'Calendar' })).toHaveFocus()
  })

  it('omits navigation and uses the action slot in flow mode', () => {
    const { container } = render(
      <ShellWide nav={false} action={<button type="button">Continue</button>}>
        <h1>Upgrade</h1>
      </ShellWide>,
    )

    expect(container.querySelector('[data-shell-sidebar]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-shell-pinned-slot]')).toHaveTextContent('Continue')
  })
})

it.each([1100, 1352, 1440])('opens from the first sidebar row at %ipx and restores its focus', (width) => {
  media.width = width
  function App() {
    const [open, setOpen] = useState(false)
    return <ShellWide items={items} activeId="hoje" navLabel="Navigation" onSelect={() => setOpen(false)}
      astraRow={{ label: 'Astra', onOpen: () => setOpen(true) }} conversationOpen={open} conversationLabel="Astra"
      conversation={<><textarea data-composer-input="" aria-label="Message" /><button onClick={() => setOpen(false)}>Close</button></>}>
      <h1>Today</h1>
    </ShellWide>
  }
  const { container } = render(<App />)
  const row = screen.getByRole('button', { name: 'Astra' })
  expect(row.parentElement?.firstElementChild).toBe(row)
  expect(row).toHaveAttribute('aria-expanded', 'false')
  expect(row.querySelector('span')).toHaveAttribute('translate', 'no')
  fireEvent.click(row)
  expect(row).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus()
  expect(screen.getByRole('link', { name: 'Hoje' })).toHaveAttribute('aria-current', 'page')
  expect(row.querySelector('svg')).toHaveAttribute('color', 'var(--primary)')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(row).toHaveFocus()
  expect(container.querySelector('[data-shell-scroller]')).toBeVisible()
  fireEvent.click(row)
  fireEvent.click(screen.getByRole('link', { name: 'Calendário' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it.each([412, 840])('mounts the sidebar Astra row only at wide widths after hydration from %ipx', (width) => {
  media.width = width
  const props = { items, activeId: 'hoje', navLabel: 'Navigation', astraRow: { label: 'Astra', onOpen: vi.fn() } }
  const view = render(<ShellWide {...props} />)
  expect(screen.queryByRole('button', { name: 'Astra' })).not.toBeInTheDocument()
  media.width = 1352
  view.rerender(<ShellWide {...props} />)
  const row = screen.getByRole('button', { name: 'Astra' })
  expect(row.parentElement?.firstElementChild).toBe(row)
  media.width = width
  view.rerender(<ShellWide {...props} />)
  expect(screen.queryByRole('button', { name: 'Astra' })).not.toBeInTheDocument()
})

it('retains the conversation node, draft and destination scroll across the wide boundary', () => {
  media.width = 1352
  const props = { items, activeId: 'hoje', navLabel: 'Navigation', astraRow: { label: 'Astra', onOpen: vi.fn() },
    conversation: <textarea data-composer-input="" aria-label="Message" defaultValue="Retained draft" />, conversationLabel: 'Astra' }
  const view = render(<ShellWide {...props} conversationOpen={false}><h1>Today</h1></ShellWide>)
  const scroller = view.container.querySelector<HTMLElement>('[data-shell-scroller]')!
  scroller.scrollTop = 240
  view.rerender(<ShellWide {...props} conversationOpen><h1>Today</h1></ShellWide>)
  const input = screen.getByRole('textbox', { name: 'Message' })
  media.width = 840
  view.rerender(<ShellWide {...props} conversationOpen><h1>Today</h1></ShellWide>)
  expect(screen.getByRole('textbox', { name: 'Message' })).toBe(input)
  expect(input).toHaveValue('Retained draft')
  media.width = 1352
  view.rerender(<ShellWide {...props} conversationOpen><h1>Today</h1></ShellWide>)
  expect(screen.getByRole('textbox', { name: 'Message' })).toBe(input)
  view.rerender(<ShellWide {...props} conversationOpen={false}><h1>Today</h1></ShellWide>)
  expect(view.container.querySelector('[data-shell-scroller]')).toBe(scroller)
  expect(scroller.scrollTop).toBe(240)
  expect(screen.getByRole('heading', { name: 'Today' })).toHaveFocus()
})

it('keeps the Astra layer open when a destination opens in another browsing context', () => {
  media.width = 1352
  const onSelect = vi.fn()
  const onSidebarNavigate = vi.fn()
  const onCreate = vi.fn()
  render(<ShellWide items={items} activeId="hoje" navLabel="Navigation" onSelect={onSelect}
    onCreate={onCreate} createLabel="Create"
    astraRow={{ label: 'Astra', onOpen: vi.fn() }} onSidebarNavigate={onSidebarNavigate}
    conversationOpen conversationLabel="Astra" conversation={<button type="button">Close</button>} />)
  const calendar = screen.getByRole('link', { name: 'Calendário' })
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
    expect(fireEvent.click(calendar, modifiers)).toBe(true)
  }
  expect(onSelect).not.toHaveBeenCalled()
  expect(onSidebarNavigate).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Astra' })).toBeInTheDocument()
  expect(fireEvent.click(calendar)).toBe(false)
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('calendario')
  expect(onSidebarNavigate).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Create' }), { ctrlKey: true })
  expect(onCreate).toHaveBeenCalledOnce()
  expect(onSidebarNavigate).toHaveBeenCalledTimes(2)
})
