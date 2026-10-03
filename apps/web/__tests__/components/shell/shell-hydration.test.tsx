import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShellWide } from '@/components/shell/shell-wide'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function ShellHydrationProbe() {
  const { isSupported: speechSupported } = useSpeechToText()

  return (
    <ShellWide
      items={[{ id: 'hoje', label: 'Today', icon: 'hoje' }]}
      activeId="hoje"
      navLabel="Main navigation"
      tabBar={<nav aria-label="Bottom navigation">Today</nav>}
      composer={<div>Composer</div>}
    >
      <h1>Today</h1>
      {speechSupported ? <button type="button">Voice</button> : null}
    </ShellWide>
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

  it.each([412, 1352])('renders the correct chrome before hydration at %ipx', async (width) => {
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
    expect(container.querySelectorAll('[data-shell-pinned-slot]')).toHaveLength(1)
    expect(serverHtml).not.toContain('Voice')
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[data-shell-sidebar]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-shell-tab-bar]')).toHaveLength(1)
    expect(container.querySelector('button')).toHaveTextContent('Voice')
  })
})
