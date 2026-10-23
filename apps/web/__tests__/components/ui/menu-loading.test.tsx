import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRef } from 'react'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.doUnmock('@/components/ui/dropdown-menu-content') })

it.each([
  { dismissal: 'Escape', customFocus: false },
  { dismissal: 'outside', customFocus: false },
  { dismissal: 'Escape', customFocus: true },
])('cancels a pending menu with $dismissal and custom focus=$customFocus before its real content loads', async ({ dismissal, customFocus }) => {
  let release!: () => void
  let contentLoaded!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  const loaded = new Promise<void>((resolve) => { contentLoaded = resolve })
  vi.doMock('@/components/ui/dropdown-menu-content', async (importOriginal) => {
    await pending
    const content = await importOriginal<typeof import('@/components/ui/dropdown-menu-content')>()
    contentLoaded()
    return content
  })
  const Menu = await import('@/components/ui/dropdown-menu')
  const returnRef = createRef<HTMLButtonElement>()
  render(<><Menu.Root><Menu.Trigger>Actions</Menu.Trigger><Menu.Content title="Actions" returnFocus={customFocus ? () => returnRef.current : undefined} items={[{ id: 'edit', label: 'Edit' }]} /></Menu.Root><button ref={returnRef}>Outside</button></>)
  const trigger = screen.getByRole('button', { name: 'Actions' })
  const destination = customFocus ? screen.getByRole('button', { name: 'Outside' }) : trigger
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}')
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  try {
    if (dismissal === 'Escape') await userEvent.keyboard('{Escape}')
    else fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }), { button: 0 })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(destination).toHaveFocus())
  } finally {
    await act(async () => { release(); await loaded })
  }
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(destination).toHaveFocus()
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}')
  expect(await screen.findByRole('menu', { name: 'Actions' })).toBeVisible()
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
})
