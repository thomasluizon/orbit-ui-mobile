import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { VERIFICATION_CODE_LENGTH } from '@orbit/shared/utils'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'

function attachFocusableRef(
  refs: Array<HTMLInputElement | null>,
  index: number,
): ReturnType<typeof vi.fn> {
  const focus = vi.fn()
  refs[index] = { focus } as unknown as HTMLInputElement
  return focus
}

describe('useLoginCodeEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('updates a single input digit and focuses the next field', () => {
    const { result } = renderHook(() => useLoginCodeEntry())
    const nextFocus = attachFocusableRef(result.current.codeInputRefs.current, 1)

    act(() => {
      result.current.onCodeInput(0, '7')
    })

    expect(result.current.codeDigits[0]).toBe('7')
    expect(nextFocus).toHaveBeenCalledTimes(1)
  })

  it('fills multiple digits from one input and completes asynchronously', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useLoginCodeEntry(onComplete))
    const lastFocus = attachFocusableRef(
      result.current.codeInputRefs.current,
      VERIFICATION_CODE_LENGTH - 1,
    )

    act(() => {
      result.current.onCodeInput(0, '123456')
    })

    expect(result.current.codeDigits).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(lastFocus).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()

    act(() => {
      vi.runAllTimers()
    })

    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('fills digits from paste events and triggers completion when enough digits are provided', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useLoginCodeEntry(onComplete))
    const lastFocus = attachFocusableRef(
      result.current.codeInputRefs.current,
      VERIFICATION_CODE_LENGTH - 1,
    )
    const preventDefault = vi.fn()

    act(() => {
      result.current.onCodePaste({
        preventDefault,
        clipboardData: {
          getData: () => '98 76-54',
        },
      } as unknown as ClipboardEvent<HTMLInputElement>)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(result.current.codeDigits).toEqual(['9', '8', '7', '6', '5', '4'])
    expect(lastFocus).toHaveBeenCalledTimes(1)

    act(() => {
      vi.runAllTimers()
    })

    expect(onComplete).toHaveBeenCalledWith('987654')
  })

  it('moves focus backward on backspace and resets digits', () => {
    const { result } = renderHook(() => useLoginCodeEntry())
    const previousFocus = attachFocusableRef(result.current.codeInputRefs.current, 0)

    act(() => {
      result.current.setCodeDigits(['4', '', '', '', '', ''])
      result.current.onCodeKeydown(1, {
        key: 'Backspace',
      } as KeyboardEvent<HTMLInputElement>)
    })

    expect(previousFocus).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.resetCodeDigits()
    })

    expect(result.current.codeDigits).toEqual(['', '', '', '', '', ''])
  })

  it('starts, advances, and clears the resend countdown timer', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result, unmount } = renderHook(() => useLoginCodeEntry())

    act(() => {
      result.current.startResendCountdown()
    })

    expect(result.current.canResend).toBe(false)
    expect(result.current.resendCountdown).toBe(60)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.resendCountdown).toBe(59)

    act(() => {
      vi.advanceTimersByTime(59000)
    })

    expect(result.current.canResend).toBe(true)
    expect(result.current.resendCountdown).toBe(0)

    act(() => {
      result.current.startResendCountdown()
    })
    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
