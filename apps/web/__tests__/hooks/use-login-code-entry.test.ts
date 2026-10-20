import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
async function renderEntry(complete?: (code: string) => void) { return renderHook(() => useLoginCodeEntry(complete)) }

describe('login code entry', () => {
  afterEach(() => { vi.useRealTimers() })

  it('keeps partial input and submits each completed edit once', async () => {
    const complete = vi.fn()
    const { result, unmount } = await renderEntry(complete)
    await act(async () => result.current.onCodeChange('12345'))
    expect(result.current.codeDigits.join('')).toBe('12345')
    expect(complete).not.toHaveBeenCalled()
    await act(async () => {
      result.current.onCodeChange('123456')
      result.current.onCodeChange('123456')
    })
    expect(complete).toHaveBeenCalledExactlyOnceWith('123456')
    await act(async () => result.current.onCodeChange('12345'))
    await act(async () => result.current.onCodeChange('123457'))
    expect(complete).toHaveBeenLastCalledWith('123457')
    await act(async () => unmount())
  })

  it('accepts a complete paste and leaves prefilled links ready for manual submission', async () => {
    const complete = vi.fn()
    const { result, unmount } = await renderEntry(complete)
    await act(async () => result.current.setCodeDigits('654321'.split('')))
    expect(result.current.codeDigits.join('')).toBe('654321')
    expect(complete).not.toHaveBeenCalled()
    await act(async () => result.current.onCodeChange('12 34-567'))
    expect(result.current.codeDigits.join('')).toBe('123456')
    expect(complete).toHaveBeenCalledExactlyOnceWith('123456')
    await act(async () => result.current.onCodeChange(''))
    expect(result.current.codeDigits).toEqual(['', '', '', '', '', ''])
    await act(async () => unmount())
  })

  it('counts 60 seconds, restarts the cooldown, and stops timers on unmount', async () => {
    vi.useFakeTimers()
    const { result, unmount } = await renderEntry()
    await act(async () => result.current.startResendCountdown())
    expect(result.current.canResend).toBe(false)
    expect(result.current.resendCountdown).toBe(60)
    await act(async () => vi.advanceTimersByTime(59_000))
    expect(result.current.resendCountdown).toBe(1)
    await act(async () => vi.advanceTimersByTime(1000))
    expect(result.current.canResend).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => result.current.startResendCountdown())
    expect(result.current.resendCountdown).toBe(60)
    await act(async () => unmount())
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts empty after leaving and returning', async () => {
    const first = await renderEntry()
    await act(async () => first.result.current.onCodeChange('1234'))
    await act(async () => first.unmount())
    const second = await renderEntry()
    expect(second.result.current.codeDigits.join('')).toBe('')
    await act(async () => second.unmount())
  })
})
