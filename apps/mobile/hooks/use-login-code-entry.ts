import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeSyntheticEvent, TextInputKeyPressEventData, TextInput } from 'react-native'
import {
  createVerificationCodeDigits,
  fillVerificationCodeDigits,
  hasInvalidVerificationCodeChars,
  normalizeVerificationCodeInput,
  VERIFICATION_CODE_LENGTH,
} from '@orbit/shared/utils'

interface UseLoginCodeEntryResult {
  codeDigits: string[]
  setCodeDigits: React.Dispatch<React.SetStateAction<string[]>>
  codeInputRefs: React.RefObject<(TextInput | null)[]>
  canResend: boolean
  resendCountdown: number
  /** i18n key for an inline paste/typing error, or null when input was clean. */
  pasteErrorKey: string | null
  clearPasteError: () => void
  startResendCountdown: () => void
  resetCodeDigits: () => void
  onCodeInput: (index: number, value: string) => void
  onCodeKeyPress: (index: number, event: NativeSyntheticEvent<TextInputKeyPressEventData>) => void
}

export function useLoginCodeEntry(): UseLoginCodeEntryResult {
  const [codeDigits, setCodeDigits] = useState(() => createVerificationCodeDigits())
  const [canResend, setCanResend] = useState(true)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [pasteErrorKey, setPasteErrorKey] = useState<string | null>(null)
  const codeInputRefs = useRef<(TextInput | null)[]>([])
  const resendTimerRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null)

  const clearPasteError = useCallback(() => setPasteErrorKey(null), [])

  const clearResendTimer = useCallback(() => {
    if (resendTimerRef.current === null) return
    globalThis.clearInterval(resendTimerRef.current)
    resendTimerRef.current = null
  }, [])

  useEffect(() => () => clearResendTimer(), [clearResendTimer])

  const startResendCountdown = useCallback(() => {
    clearResendTimer()
    setCanResend(false)
    setResendCountdown(60)
    resendTimerRef.current = globalThis.setInterval(() => {
      setResendCountdown((previous) => {
        if (previous <= 1) {
          setCanResend(true)
          clearResendTimer()
          return 0
        }
        return previous - 1
      })
    }, 1000)
  }, [clearResendTimer])

  const resetCodeDigits = useCallback(() => {
    setCodeDigits(createVerificationCodeDigits())
  }, [])

  const onCodeInput = useCallback((index: number, value: string) => {
    const cleanValue = normalizeVerificationCodeInput(value)

    // Mirror web parity (PLAN.md frontend P2): surface an inline error
    // when the user pastes/types non-digits instead of silently stripping.
    if (hasInvalidVerificationCodeChars(value)) {
      setPasteErrorKey('auth.errors.codeMustBeDigits')
    } else if (cleanValue) {
      setPasteErrorKey(null)
    }

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
    (index: number, event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
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
    pasteErrorKey,
    clearPasteError,
    startResendCountdown,
    resetCodeDigits,
    onCodeInput,
    onCodeKeyPress,
  }
}
