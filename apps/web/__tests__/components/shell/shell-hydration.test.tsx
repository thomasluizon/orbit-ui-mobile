import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function ShellHydrationProbe() {
  const wide = useIsWideDesktop()
  const { isSupported: speechSupported } = useSpeechToText()

  return (
    <div data-shell={wide ? 'wide' : '412'}>
      {speechSupported ? <button type="button">Voice</button> : null}
    </div>
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

  it('matches the narrow server shell on the first client render at a wide viewport', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(min-width: 1024px)',
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

    expect(serverHtml).toContain('data-shell="412"')
    expect(serverHtml).not.toContain('Voice')
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('[data-shell]')).toHaveAttribute('data-shell', 'wide')
    expect(container.querySelector('button')).toHaveTextContent('Voice')
  })
})
