import { act, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))

function ShellHydrationProbe() {
  const { isSupported: speechSupported } = useSpeechToText()

  return (
    <DestinationShell onCreate={() => {}} composer={<div>Composer<textarea aria-label="Draft" defaultValue="Draft" /></div>}>
      <RootNotificationHeader />
      <h1>Today</h1>
      {speechSupported ? <button type="button">Voice</button> : null}
    </DestinationShell>
  )
}

function setRecordingSupport(supported: boolean) {
  vi.stubGlobal('navigator', supported ? { mediaDevices: { getUserMedia: vi.fn() } } : {})
  vi.stubGlobal('MediaRecorder', supported ? class MediaRecorderStub {} : undefined)
}

describe('app shell hydration', () => {
  let root: Root | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it.each([412, 1023, 1024, 1100, 1352])('renders the correct chrome before hydration at %ipx', async (width) => {
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
    setRecordingSupport(false)

    const serverHtml = renderToString(<ShellHydrationProbe />)
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)
    const recoverableError = vi.fn()

    const firstComposer = container.querySelector('[data-shell-pinned-slot]')
    const firstInput = container.querySelector('textarea')!
    if (width < 1024) {
      firstInput.focus()
    }
    const firstSidebarBell = container.querySelector('[data-shell-sidebar] button[aria-label="notifications.bell"]')
    const firstAstraRow = container.querySelector('[data-shell-astra-row]')
    expect(firstAstraRow, 'sidebar Astra row exists in server HTML').not.toBeNull()

    expect(firstSidebarBell, 'sidebar bell exists in server HTML').not.toBeNull()
    expect(firstComposer, 'compact composer exists before CSS chooses the chrome').not.toBeNull()

    setRecordingSupport(true)
    await act(async () => {
      root = hydrateRoot(container, <ShellHydrationProbe />, { onRecoverableError: recoverableError })
    })

    expect(serverHtml).toContain('data-shell-sidebar=""')
    expect(serverHtml).toContain('data-shell-tab-bar=""')
    const sidebar = container.querySelector('[data-shell-sidebar]')
    const tabBar = container.querySelector('[data-shell-tab-bar]')
    if (width >= 1024) {
      expect(sidebar).toHaveClass('lg:flex')
      expect(tabBar).toHaveClass('lg:hidden')
    } else {
      expect(sidebar).toHaveClass('hidden')
      expect(tabBar).not.toHaveClass('hidden')
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelectorAll('[data-shell-pinned-slot]')).toHaveLength(width >= 1024 ? 0 : 1)
    expect(serverHtml).not.toContain('Voice')
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[data-shell-sidebar]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-shell-tab-bar]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-shell-astra-row]')).toHaveLength(width >= 1024 ? 1 : 0)
    if (width >= 1024) expect(container.querySelector('[data-shell-astra-row]')).toBe(firstAstraRow)
    expect(container.querySelectorAll('[data-root-notification-header]')).toHaveLength(width >= 1024 ? 0 : 1)
    expect(container.querySelector('[data-shell-sidebar] button[aria-label="notifications.bell"]')).toBe(firstSidebarBell)
    if (width < 1024) {
      expect(container.querySelector('[data-shell-pinned-slot]')).toBe(firstComposer)
      expect(container.querySelector('textarea')).toBe(firstInput)
      expect(firstInput).toHaveFocus()
      expect(firstInput).toHaveValue('Draft')
    }
    if (width >= 1024) {
      expect(container.querySelector('textarea')).toBeNull()
      expect(container.querySelector('[data-shell-pinned-slot]')).toBeNull()
    }
    expect(within(container).getByRole('button', { name: 'Voice' })).toBeVisible()
  })
})
