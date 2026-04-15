import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createVerificationCodeDigits,
  fillVerificationCodeDigits,
  hasInvalidVerificationCodeChars,
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
  /** i18n key for an inline paste/typing error, or null when input was clean. */
  pasteErrorKey: string | null
  clearPasteError: () => void
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
  const [pasteErrorKey, setPasteErrorKey] = useState<string | null>(null)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
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

  const onCodeInput = useCallback(
    (index: number, value: string) => {
      const cleanValue = normalizeVerificationCodeInput(value)

      // If the user typed/pasted via input event a string containing
      // non-digits, surface an inline error instead of silently stripping.
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

        if (onCompleteCode && isVerificationCodeComplete(digits, VERIFICATION_CODE_LENGTH)) {
          globalThis.setTimeout(() => onCompleteCode(digits.join('')), 0)
        }
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
    [codeDigits, onCompleteCode],
  )

  const onCodePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault()
      const rawPasted = event.clipboardData.getData('text')
      const pasted = normalizeVerificationCodeInput(rawPasted)

      // Surface inline error when the clipboard contained non-digits, even
      // if some digits were extracted. Stops the silent-strip behaviour.
      if (hasInvalidVerificationCodeChars(rawPasted)) {
        setPasteErrorKey('auth.errors.codeMustBeDigits')
      } else {
        setPasteErrorKey(null)
      }

      if (!pasted) return

      const { digits, nextFocusIndex } = fillVerificationCodeDigits(
        0,
        pasted.slice(0, VERIFICATION_CODE_LENGTH),
        createVerificationCodeDigits(),
      )
      setCodeDigits(digits)
      codeInputRefs.current[nextFocusIndex]?.focus()

      if (onCompleteCode && pasted.length >= VERIFICATION_CODE_LENGTH) {
        globalThis.setTimeout(() => onCompleteCode(digits.join('')), 0)
      }
    },
    [onCompleteCode],
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
    pasteErrorKey,
    clearPasteError,
    startResendCountdown,
    resetCodeDigits,
    onCodeInput,
    onCodePaste,
    onCodeKeydown,
  }
}
