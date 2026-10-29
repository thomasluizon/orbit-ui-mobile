vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import * as Menu from '@/components/ui/dropdown-menu'
import { CalendarOptions } from '@/app/(app)/calendar/_components/calendar-options'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))

function Example({ presentation }: Readonly<{ presentation: 'anchored' | 'sheet' | 'owner-sheet' }>) {
  const [open, setOpen] = useState(false)
  if (presentation === 'owner-sheet') return <><CalendarOptions /><button>Outside</button></>
  return <><Menu.Root open={open} onOpenChange={setOpen}>
    <Menu.Trigger>Actions</Menu.Trigger>
    <Menu.Content title="Actions" presentation={presentation} items={[{ id: 'edit', label: 'Edit' }]} />
  </Menu.Root><button>Outside</button></>
}

it.each(['anchored', 'sheet', 'owner-sheet'] as const)('keeps the opening pointer gesture in %s until a later dismissal', async (presentation) => {
  const user = userEvent.setup()
  render(<Example presentation={presentation} />)
  const title = presentation === 'owner-sheet' ? 'calendar.options' : 'Actions'
  const trigger = screen.getByRole('button', { name: title })
  const role = presentation === 'anchored' ? 'menu' : 'dialog'
  await user.hover(trigger)
  await user.pointer({ target: trigger, keys: '[MouseLeft>]' })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const releaseTarget = document.querySelector<HTMLElement>('.orbit-sheet-backdrop') ?? trigger
  await user.pointer({ target: releaseTarget, keys: '[/MouseLeft]' })
  expect(await screen.findByRole(role, { name: title })).toBeVisible()
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole(role)).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  await user.click(trigger)
  expect(await screen.findByRole(role, { name: title })).toBeVisible()
  const outside = document.querySelector<HTMLElement>('.orbit-sheet-backdrop') ?? screen.getByRole('button', { name: 'Outside' })
  await user.click(outside)
  await waitFor(() => expect(screen.queryByRole(role)).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

it.each(['{Enter}', ' ', '{ArrowDown}'])('retains keyboard opening with %s and focus return', async (key) => {
  const user = userEvent.setup()
  render(<Example presentation="anchored" />)
  const trigger = screen.getByRole('button', { name: 'Actions' })
  trigger.focus()
  await user.keyboard(key)
  expect(await screen.findByRole('menu', { name: 'Actions' })).toBeVisible()
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

it.each(['anchored', 'sheet'] as const)('opens %s from a virtual click and retains pointer and keyboard activation', async presentation => {
  const user = userEvent.setup()
  render(<Example presentation={presentation} />)
  const trigger = screen.getByRole('button', { name: 'Actions' })
  for (const activation of ['virtual', 'pointer', 'keyboard']) {
    if (activation === 'virtual') act(() => trigger.click())
    else if (activation === 'pointer') await user.click(trigger)
    else await user.keyboard('{Enter}')
    expect(await screen.findByRole('menu', { name: 'Actions' })).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  }
})

it.each(['disabled', 'prevented'] as const)('keeps a %s trigger closed on virtual activation', async state => {
  const onClick = vi.fn((event: React.MouseEvent) => { if (state === 'prevented') event.preventDefault() })
  render(<Menu.Root><Menu.Trigger disabled={state === 'disabled'} onClick={onClick}>Actions</Menu.Trigger>
    <Menu.Content title="Actions" items={[{ id: 'edit', label: 'Edit' }]} /></Menu.Root>)
  const trigger = screen.getByRole('button', { name: 'Actions' })
  act(() => trigger.click())
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  if (state === 'prevented') expect(onClick).toHaveBeenCalledOnce()
})
