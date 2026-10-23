import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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
