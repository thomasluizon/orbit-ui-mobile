import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { waitForLazyContent } from '@/__tests__/support/lazy-content'
import * as InitialMenu from '@/components/ui/dropdown-menu'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

let Menu = InitialMenu
afterEach(async () => {
  vi.doUnmock('@/components/ui/dropdown-menu-content')
  vi.resetModules()
  Menu = await import('@/components/ui/dropdown-menu')
})

it.each([
  { dismissal: 'Escape', customFocus: false },
  { dismissal: 'outside', customFocus: false },
  { dismissal: 'Escape', customFocus: true },
])('cancels a pending menu with $dismissal and custom focus=$customFocus before its real content loads', async ({ dismissal, customFocus }) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  let contentLoaded!: () => void
  let contentFailed!: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => { contentLoaded = resolve; contentFailed = reject })
  vi.doMock('@/components/ui/dropdown-menu-content', async (importOriginal) => {
    await pending
    const loading = importOriginal<typeof import('@/components/ui/dropdown-menu-content')>()
    void loading.then(contentLoaded, contentFailed)
    return loading
  })
  const returnRef = createRef<HTMLButtonElement>()
  render(<><Menu.Root><Menu.Trigger>Actions</Menu.Trigger><Menu.Content title="Actions" returnFocus={customFocus ? () => returnRef.current : undefined} items={[{ id: 'edit', label: 'Edit' }]} /></Menu.Root><button ref={returnRef}>Outside</button></>)
  const trigger = screen.getByRole('button', { name: 'Actions' })
  const destination = customFocus ? screen.getByRole('button', { name: 'Outside' }) : trigger
  try {
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    if (dismissal === 'Escape') await userEvent.keyboard('{Escape}')
    else fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }), { button: 0 })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(destination).toHaveFocus())
  } finally {
    release()
    await waitForLazyContent(ready)
  }
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(destination).toHaveFocus()
  trigger.focus()
  await userEvent.keyboard('{ArrowDown}')
  expect(await screen.findByRole('menu', { name: 'Actions' })).toBeVisible()
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
})
