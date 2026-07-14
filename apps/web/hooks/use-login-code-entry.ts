import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createVerificationCodeDigits,
  fillVerificationCodeDigits,
  isVerificationCodeComplete,
  normalizeVerificationCodeInput,
  VERIFICATION_CODE_LENGTH,
} from '@orbit/shared/utils'

interface UseLoginCodeEntryResult {
  codeDigits: string[]
  setCodeDigits: React.Dispatch<React.SetStateAction<string[]>>
  codeInputRefs: React.RefObject<(HTMLInputElement | null)[]>
  canResend: boolean
  resendCountdown: number
  startResendCountdown: () => void
  resetCodeDigits: () => void
  onCodeInput: (index: number, value: string) => void
  onCodePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  onCodeKeydown: (index: number, event: React.KeyboardEvent<HTMLInputElement>) => void
}

export function useLoginCodeEntry(onCompleteCode?: (code: string) => void): UseLoginCodeEntryResult {
  const [codeDigits, setCodeDigits] = useState(() => createVerificationCodeDigits())
  const [canResend, setCanResend] = useState(true)
  const [resendCountdown, setResendCountdown] = useState(0)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const resendTimerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null)
  const resendCountdownRef = useRef(0)
  const submittedCodeRef = useRef<string | null>(null)

  const clearResendTimer = useCallback(() => {
    if (resendTimerRef.current === null) return
    globalThis.clearInterval(resendTimerRef.current)
    resendTimerRef.current = null
  }, [])

  useEffect(() => () => clearResendTimer(), [clearResendTimer])

  const joinedCode = codeDigits.join('')
  useEffect(() => {
    if (!isVerificationCodeComplete(codeDigits, VERIFICATION_CODE_LENGTH)) {
      submittedCodeRef.current = null
      return
    }
    if (submittedCodeRef.current === joinedCode) return
    submittedCodeRef.current = joinedCode
    // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent -- reusable controlled code-entry primitive: a single deduped effect is the one notification point for completion however the digits were filled (keystroke, paste, or the parent's own setCodeDigits); lifting codeDigits into every parent is a worse API; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    onCompleteCode?.(joinedCode)
  }, [codeDigits, joinedCode, onCompleteCode])

  const startResendCountdown = useCallback(() => {
    clearResendTimer()
    setCanResend(false)
    resendCountdownRef.current = 60
    setResendCountdown(60)
    resendTimerRef.current = globalThis.setInterval(() => {
      const next = Math.max(resendCountdownRef.current - 1, 0)
      resendCountdownRef.current = next
      setResendCountdown(next)
      if (next === 0) {
        clearResendTimer()
        setCanResend(true)
      }
    }, 1000)
  }, [clearResendTimer])

  const resetCodeDigits = useCallback(() => {
    setCodeDigits(createVerificationCodeDigits())
  }, [])

  const onCodeInput = useCallback(
    (index: number, value: string) => {
      const cleanValue = normalizeVerificationCodeInput(value)

      if (cleanValue.length > 1) {
        const { digits, nextFocusIndex } = fillVerificationCodeDigits(
          index,
          cleanValue,
          codeDigits,
        )
        setCodeDigits(digits)
        codeInputRefs.current[nextFocusIndex]?.focus()
        return
      }

      setCodeDigits((previous) => {
        const nextDigits = [...previous]
        nextDigits[index] = cleanValue
        return nextDigits
      })

      if (cleanValue && index < VERIFICATION_CODE_LENGTH - 1) {
        codeInputRefs.current[index + 1]?.focus()
      }
    },
    [codeDigits],
  )

  const onCodePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault()
      const pasted = normalizeVerificationCodeInput(event.clipboardData.getData('text'))
      if (!pasted) return

      const { digits, nextFocusIndex } = fillVerificationCodeDigits(
        0,
        pasted.slice(0, VERIFICATION_CODE_LENGTH),
        createVerificationCodeDigits(),
      )
      setCodeDigits(digits)
      codeInputRefs.current[nextFocusIndex]?.focus()
    },
    [],
  )

  const onCodeKeydown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
        codeInputRefs.current[index - 1]?.focus()
      }
    },
    [codeDigits],
  )

  return {
    codeDigits,
    setCodeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    startResendCountdown,
    resetCodeDigits,
    onCodeInput,
    onCodePaste,
    onCodeKeydown,
  }
}
