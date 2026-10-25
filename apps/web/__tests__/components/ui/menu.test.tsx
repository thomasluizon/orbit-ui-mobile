import { createRef, useState, type ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { useUIStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/pill-button'
import * as Menu from '@/components/ui/dropdown-menu'
import { Content as LoadedContent } from '@/components/ui/dropdown-menu-content'
import { renderToString } from 'react-dom/server'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const items = [
  { id: 'delete', label: 'Delete', destructive: true },
  { id: 'edit', label: 'Edit', icon: 'pencil' },
  { id: 'unavailable', label: 'Unavailable', disabled: true },
] as const

function setWide(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }))
}

function Example({ onSelect, ...props }: ComponentProps<typeof Menu.Content>) {
  const [open, setOpen] = useState(false)
  return <><button>Before</button><Menu.Root open={open} onOpenChange={setOpen}>
    <Menu.Trigger asChild><button type="button">More</button></Menu.Trigger>
    <Menu.Content title="Habit actions" items={items} onSelect={onSelect} {...props} />
  </Menu.Root><button>After</button></>
}

async function openMenu(waitForContent = true) {
  await userEvent.click(screen.getByRole('button', { name: 'More' }))
  if (waitForContent) await screen.findByRole('menu')
}

describe('headless Menu', () => {
  beforeEach(() => { vi.restoreAllMocks(); setWide(true) })

  it.each([en, ptBR].flatMap(messages => (['anchored', 'sheet'] as const).map(presentation => ({ messages, presentation }))))('shows an Astra action label with sibling row treatment in $presentation', async ({ messages, presentation }) => {
    setWide(presentation === 'anchored')
    const onSelect = vi.fn()
    const label = messages.habits.actions.rescheduleAstra
    render(<Example presentation={presentation} onSelect={onSelect} items={[
      { id: 'edit', label: messages.common.edit, icon: 'pencil' },
      { id: 'reschedule', label, icon: 'astra' },
    ]} />)
    await openMenu()
    const action = screen.getByRole('menuitem', { name: label })
    const sibling = screen.getByRole('menuitem', { name: messages.common.edit })
    expect(action).toHaveTextContent(label)
    expect(action).toHaveAccessibleName(label)
    expect(action).not.toHaveAttribute('aria-label')
    expect(action.style.cssText).toBe(sibling.style.cssText)
    expect(action.querySelector('[data-asset^="astra-mark"]')).not.toBeNull()
    await userEvent.keyboard('{ArrowDown}')
    expect(action).toHaveFocus()
    await userEvent.keyboard(`{Home}${label[0]}`)
    await waitFor(() => expect(action).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('reschedule')
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  })

  it('renders open content on the server without reading the browser viewport', () => {
    const viewport = vi.spyOn(window, 'matchMedia').mockImplementation(() => { throw new Error('Browser viewport is unavailable during server rendering') })
    expect(() => renderToString(<Menu.Root open><Menu.Trigger>More</Menu.Trigger><LoadedContent title="Habit actions" items={items} firstItemRef={createRef()}>{null}</LoadedContent></Menu.Root>)).not.toThrow()
    expect(viewport).not.toHaveBeenCalled()
  })

  it('opens directly as an anchored menu by keyboard without presenting a modal sheet', async () => {
    const overlays: string[] = []
    const unsubscribe = useUIStore.subscribe((state) => { overlays.push(...state.openOverlayIds) })
    try {
      render(<Example />)
      const trigger = screen.getByRole('button', { name: 'More' })
      await userEvent.tab()
      await userEvent.tab()
      await userEvent.keyboard('{ArrowDown}')
      await screen.findByRole('menu', { name: 'Habit actions' })
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
      expect(overlays.filter((id) => id.startsWith('modal:'))).toEqual([])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'More' })).toBe(trigger)
    } finally { unsubscribe() }
  })

  it('uses typeahead to move focus to the matching action', async () => {
    render(<Example />)
    await openMenu()
    await userEvent.keyboard('d')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus())
  })

  it.each(['anchored', 'sheet'] as const)('opens the %s menu on one press, orders actions, and reports one id', async (presentation) => {
    const onSelect = vi.fn()
    render(<Example presentation={presentation} onSelect={onSelect} />)
    await openMenu()
    const menu = await screen.findByRole('menu', { name: 'Habit actions' })
    expect(menu).toBeVisible()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Edit', 'Unavailable', 'Delete'])
    expect(screen.getByRole('menuitem', { name: 'Unavailable' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Edit' }).querySelector('[data-icon="pencil"] svg')).toHaveAttribute('stroke-width', '2')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onSelect.mock.calls).toEqual([['edit']])
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  })

  it.each(['anchored', 'sheet'] as const)('dismisses the %s menu with Escape and restores its trigger', async (presentation) => {
    const onSelect = vi.fn()
    render(<Example presentation={presentation} onSelect={onSelect} />)
    await openMenu()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onSelect).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  })

  it('dismisses on an outside press and restores its trigger', async () => {
    render(<Example />)
    await openMenu()
    await userEvent.click(screen.getByRole('button', { name: 'After' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  })

  it.each([true, false])('keeps checked state %s when dismissed', async (checked) => {
    const onSelect = vi.fn()
    render(<Example items={[{ id: 'repeat', label: 'Recurring habits', checked }]} onSelect={onSelect} />)
    await openMenu()
    expect(screen.getByRole('menuitemcheckbox', { name: 'Recurring habits' })).toHaveAttribute('aria-checked', String(checked))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('moves focus with arrows, Home and End while skipping disabled actions', async () => {
    render(<Example />)
    screen.getByRole('button', { name: 'More' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    const edit = await screen.findByRole('menuitem', { name: 'Edit' })
    await waitFor(() => expect(edit).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(edit).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(edit).toHaveFocus()
  })

  it('names compact menus after the trigger while keeping a short heading', async () => {
    setWide(false)
    render(<Example title="List options" shortTitle="Options" />)
    await openMenu()
    expect(await screen.findByRole('dialog', { name: 'List options' })).toBeVisible()
    expect(screen.getByRole('menu', { name: 'List options' })).toBeVisible()
    expect(document.querySelector('.orbit-sheet-title')).toHaveTextContent('Options')
    expect(screen.getByRole('button', { name: 'After', hidden: true }).closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('discloses a full typed sheet title', async () => {
    setWide(false)
    const title = 'Ler um capítulo inteiro do livro de história antes de dormir'
    render(<Example title={title} shortTitle="Ler" titleMode="typed" />)
    await openMenu()
    await userEvent.click(await screen.findByRole('button', { name: title }))
    expect(document.querySelector('.orbit-sheet-full-title')).toHaveTextContent(title)
  })

  it('keeps badged routes actionable and does not open an empty menu', async () => {
    const onSelect = vi.fn()
    const view = render(<Example items={[{ id: 'pro', label: 'Upgrade', disabled: true, badge: 'Pro' }]} onSelect={onSelect} />)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'UpgradePro' }))
    expect(onSelect).toHaveBeenCalledWith('pro')
    view.unmount()
    render(<Example items={[]} />)
    await openMenu(false)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('leaves focus with the selected editor when requested', async () => {
    render(<><input aria-label="Editor" /><Example restoreFocusOnSelect={false} onSelect={() => screen.getByRole('textbox', { hidden: true }).focus()} /></>)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
  })
  it.each([false, true])('leaves an anchored menu with Tab, backwards=%s', async (backwards) => {
    render(<Example />)
    await openMenu()
    await userEvent.tab({ shift: backwards })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByRole('button', { name: backwards ? 'Before' : 'After' })).toHaveFocus()
  })

  it.each(['sheet', 'anchored'] as const)('resets focus restoration after selecting into an editor from %s', async (presentation) => {
    render(<><input aria-label="Editor" /><Example presentation={presentation} restoreFocusOnSelect={false} onSelect={() => screen.getByRole('textbox', { hidden: true }).focus()} /></>)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    await openMenu()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  })

  it('preserves native trigger semantics through the Orbit button', async () => {
    render(<Menu.Root><Menu.Trigger asChild><Button>Options</Button></Menu.Trigger><Menu.Content title="Options" items={items} /></Menu.Root>)
    const trigger = screen.getByRole('button', { name: 'Options' })
    expect(trigger).toHaveAttribute('type', 'button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    expect(await screen.findByRole('menu')).toBeVisible()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', screen.getByRole('menu').id)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('lets Tab reach the compact sheet close control', async () => {
    render(<Example presentation="sheet" />)
    await openMenu()
    await userEvent.tab()
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus())
    expect(screen.getByRole('menu')).toBeVisible()
    await userEvent.tab({ shift: true })
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
  })

  it('skips hidden controls when Tab leaves an anchored menu', async () => {
    render(<><Menu.Root><Menu.Trigger asChild><button>More</button></Menu.Trigger><Menu.Content title="Actions" items={items} /></Menu.Root><div style={{ display: 'none' }}><button>Hidden</button></div><button>Visible</button></>)
    await openMenu()
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByRole('button', { name: 'Visible' })).toHaveFocus()
  })

  it('keeps focus moved by the selected action', async () => {
    render(<><input aria-label="Editor" /><Example onSelect={() => screen.getByRole('textbox').focus()} /></>)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
  })

})

it.each([true, false])('keeps an optional static header outside the action focus order with wide=%s', async (wide) => {
  setWide(wide)
  render(<Menu.Root open><Menu.Trigger>Account</Menu.Trigger><Menu.Content title="Account" header={<div>Person, person@example.com</div>}
    items={[{ id: 'signOut', label: 'Sign out' }]} /></Menu.Root>)
  const menu = await screen.findByRole('menu')
  expect(menu).toHaveTextContent('Person, person@example.com')
  expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus())
})

it('uses the compact menu when matchMedia is unavailable', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')!
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined })
  try {
    const onSelect = vi.fn()
    render(<Example onSelect={onSelect} />)
    await openMenu()
    expect(await screen.findByRole('menu', { name: 'Habit actions' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Habit actions' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('edit')
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  } finally {
    Object.defineProperty(window, 'matchMedia', descriptor)
  }
})
