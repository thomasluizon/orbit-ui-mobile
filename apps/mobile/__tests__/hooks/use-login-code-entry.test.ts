import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'

const TestRenderer = require('react-test-renderer')
const React = require('react')

type Hook = ReturnType<typeof useLoginCodeEntry>

interface Harness {
  current: Hook
  unmount: () => void
}

async function renderLoginCodeEntry(onComplete?: (code: string) => void): Promise<Harness> {
  const holder: { current: Hook | null } = { current: null }

  function Component() {
    holder.current = useLoginCodeEntry(onComplete)
    return null
  }

  let renderer: { unmount: () => void } | null = null
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(Component))
    await Promise.resolve()
  })

  if (!holder.current || !renderer) {
    throw new Error('Expected useLoginCodeEntry to initialize')
  }

  return {
    get current() {
      if (!holder.current) throw new Error('hook not rendered')
      return holder.current
    },
    unmount: () => (renderer as { unmount: () => void }).unmount(),
  }
}

async function act(fn: () => void): Promise<void> {
  await TestRenderer.act(async () => {
    fn()
    await Promise.resolve()
  })
}

function pressKey(key: string) {
  return { nativeEvent: { key } } as Parameters<Hook['onCodeKeyPress']>[1]
}

describe('mobile useLoginCodeEntry', () => {
  it('advances digit-by-digit on single-character input', async () => {
    const harness = await renderLoginCodeEntry()

    await act(() => harness.current.onCodeInput(0, '1'))
    await act(() => harness.current.onCodeInput(1, '2'))

    expect(harness.current.codeDigits).toEqual(['1', '2', '', '', '', ''])
  })

  it('ignores non-numeric characters', async () => {
    const harness = await renderLoginCodeEntry()

    await act(() => harness.current.onCodeInput(0, 'a'))

    expect(harness.current.codeDigits).toEqual(['', '', '', '', '', ''])
  })

  it('fills all digits from a pasted multi-character value', async () => {
    const harness = await renderLoginCodeEntry()

    await act(() => harness.current.onCodeInput(0, '654321'))

    expect(harness.current.codeDigits).toEqual(['6', '5', '4', '3', '2', '1'])
  })

  it('resets digits to empty', async () => {
    const harness = await renderLoginCodeEntry()

    await act(() => harness.current.onCodeInput(0, '123456'))
    await act(() => harness.current.resetCodeDigits())

    expect(harness.current.codeDigits).toEqual(['', '', '', '', '', ''])
  })

  describe('auto-submit (completeness watcher)', () => {
    it('fires once when the final digit completes a valid code', async () => {
      const onComplete = vi.fn()
      const harness = await renderLoginCodeEntry(onComplete)

      await act(() => harness.current.onCodeInput(0, '1'))
      await act(() => harness.current.onCodeInput(1, '2'))
      await act(() => harness.current.onCodeInput(2, '3'))
      await act(() => harness.current.onCodeInput(3, '4'))
      await act(() => harness.current.onCodeInput(4, '5'))
      expect(onComplete).not.toHaveBeenCalled()

      await act(() => harness.current.onCodeInput(5, '6'))

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith('123456')
    })

    it('fires once for a pasted complete code (no double submit)', async () => {
      const onComplete = vi.fn()
      const harness = await renderLoginCodeEntry(onComplete)

      await act(() => harness.current.onCodeInput(0, '123456'))

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledWith('123456')
    })

    it('re-fires after the code is cleared and re-entered', async () => {
      const onComplete = vi.fn()
      const harness = await renderLoginCodeEntry(onComplete)

      await act(() => harness.current.onCodeInput(0, '123456'))
      expect(onComplete).toHaveBeenCalledTimes(1)

      await act(() => harness.current.resetCodeDigits())
      await act(() => harness.current.onCodeInput(0, '123456'))

      expect(onComplete).toHaveBeenCalledTimes(2)
    })

    it('does not fire for an incomplete code', async () => {
      const onComplete = vi.fn()
      const harness = await renderLoginCodeEntry(onComplete)

      await act(() => harness.current.onCodeInput(0, '12345'))

      expect(onComplete).not.toHaveBeenCalled()
    })
  })

  describe('backspace navigation', () => {
    it('moves focus to the previous input when backspacing an empty cell', async () => {
      const harness = await renderLoginCodeEntry()
      const focusSpy = vi.fn()
      harness.current.codeInputRefs.current[0] = { focus: focusSpy } as never

      await act(() => harness.current.onCodeKeyPress(1, pressKey('Backspace')))

      expect(focusSpy).toHaveBeenCalled()
    })

    it('does not move focus when the current cell has a value', async () => {
      const harness = await renderLoginCodeEntry()
      await act(() => harness.current.onCodeInput(1, '4'))
      const focusSpy = vi.fn()
      harness.current.codeInputRefs.current[0] = { focus: focusSpy } as never

      await act(() => harness.current.onCodeKeyPress(1, pressKey('Backspace')))

      expect(focusSpy).not.toHaveBeenCalled()
    })
  })

  describe('resend countdown', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('counts down from 60 and re-enables resend at zero', async () => {
      const harness = await renderLoginCodeEntry()

      await act(() => harness.current.startResendCountdown())
      expect(harness.current.canResend).toBe(false)
      expect(harness.current.resendCountdown).toBe(60)

      await act(() => vi.advanceTimersByTime(1000))
      expect(harness.current.resendCountdown).toBe(59)

      await act(() => vi.advanceTimersByTime(60_000))
      expect(harness.current.resendCountdown).toBe(0)
      expect(harness.current.canResend).toBe(true)
    })

    it('clears the interval on unmount', async () => {
      const harness = await renderLoginCodeEntry()
      await act(() => harness.current.startResendCountdown())

      const clearSpy = vi.spyOn(globalThis, 'clearInterval')
      await act(() => harness.unmount())

      expect(clearSpy).toHaveBeenCalled()
    })
  })
})
