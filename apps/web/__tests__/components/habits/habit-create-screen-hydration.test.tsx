vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { useId } from 'react'
import { act, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DestinationShell } from '@/components/shell/destination-shell'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/habits/new', useParams: () => ({}), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))

function CreateTaskScreen() {
  const formId = useId()
  return (
    <HabitCreateFrame presentation="screen" fromConversation={false} leaving={false}
      actionRefreshKey="ready" onNavigate={() => {}} onReturn={() => {}}
      open title="habits.form.newTask" onAttemptDismiss={() => {}} onClose={() => {}}
      actions={<HabitCreateActions presentation="screen" pending={false} empty task subHabit={false}
        online formId={formId} onCancel={() => {}} />}>
      <form id={formId}><label>habits.form.taskDescribe<input /></label></form>
    </HabitCreateFrame>
  )
}

function CreateRoute() {
  return <DestinationShell onCreate={() => {}}><CreateTaskScreen /></DestinationShell>
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: width >= 1024 && query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  })
}

describe('habit create screen hydration', () => {
  let root: Root | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    document.body.replaceChildren()
  })

  it.each([412, 1352])('keeps the server form and its create reason once the footer is pinned at %ipx', async (width) => {
    setViewportWidth(width)
    const container = document.createElement('div')
    container.innerHTML = renderToString(<CreateRoute />)
    document.body.append(container)
    const serverInput = within(container).getByRole('textbox', { name: 'habits.form.taskDescribe' })
    const serverSubmit = within(container).getByRole('button', { name: 'habits.createTask' })
    const reasonId = serverSubmit.getAttribute('aria-describedby')
    expect(reasonId).toBeTruthy()
    expect(document.getElementById(reasonId!)).toHaveTextContent('habits.form.taskCreateWhy')
    const recoverableError = vi.fn()

    await act(async () => {
      root = hydrateRoot(container, <CreateRoute />, { onRecoverableError: recoverableError })
    })

    expect(recoverableError).not.toHaveBeenCalled()
    const submit = within(container).getByRole('button', { name: 'habits.createTask' })
    expect(submit.closest('[data-shell-pinned-slot]')).not.toBeNull()
    expect(within(container).getByRole('textbox', { name: 'habits.form.taskDescribe' })).toBe(serverInput)
    expect(submit).toHaveAttribute('aria-describedby', reasonId)
    expect(document.getElementById(reasonId!)).toHaveTextContent('habits.form.taskCreateWhy')
  })
})
