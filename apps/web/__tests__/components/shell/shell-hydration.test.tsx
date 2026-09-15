import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function ShellHydrationProbe() {
  const { isSupported } = useSpeechToText()
  return <div>{isSupported ? <button type="button">Voice</button> : null}</div>
}

describe('app shell hydration', () => {
  let root: Root | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = undefined
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('keeps recording support stable through the first client render', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('MediaRecorder', undefined)
    const serverHtml = renderToString(<ShellHydrationProbe />)
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)

    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    vi.stubGlobal('MediaRecorder', class MediaRecorderStub {})
    const recoverableError = vi.fn()
    await act(async () => {
      root = hydrateRoot(container, <ShellHydrationProbe />, { onRecoverableError: recoverableError })
    })

    expect(serverHtml).not.toContain('Voice')
    expect(recoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('button')).toHaveTextContent('Voice')
  })
})
