import { useCallback, useEffect, useRef, useState } from 'react'
import type { TextInputKeyPressEvent, TextInput } from 'react-native'
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
  codeInputRefs: React.RefObject<(TextInput | null)[]>
  canResend: boolean
  resendCountdown: number
  startResendCountdown: () => void
  resetCodeDigits: () => void
  onCodeInput: (index: number, value: string) => void
  onCodeKeyPress: (index: number, event: TextInputKeyPressEvent) => void
}

export function useLoginCodeEntry(onCompleteCode?: (code: string) => void): UseLoginCodeEntryResult {
  const [codeDigits, setCodeDigits] = useState(() => createVerificationCodeDigits())
  const [canResend, setCanResend] = useState(true)
  const [resendCountdown, setResendCountdown] = useState(0)
  const codeInputRefs = useRef<(TextInput | null)[]>([])
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

  const onCodeInput = useCallback((index: number, value: string) => {
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
  }, [codeDigits])

  const onCodeKeyPress = useCallback(
    (index: number, event: TextInputKeyPressEvent) => {
      if (event.nativeEvent.key === 'Backspace' && !codeDigits[index] && index > 0) {
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
    onCodeKeyPress,
  }
}
