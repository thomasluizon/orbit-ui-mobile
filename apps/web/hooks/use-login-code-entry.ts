import { useCallback, useEffect, useRef, useState } from 'react'
import { createVerificationCodeDigits, normalizeVerificationCodeInput, VERIFICATION_CODE_LENGTH } from '@orbit/shared/utils'

export function useLoginCodeEntry(onCompleteCode?: (code: string) => void) {
  const [codeDigits, setCodeDigits] = useState(() => createVerificationCodeDigits())
  const [resendCountdown, setResendCountdown] = useState(0)
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const submittedCode = useRef<string | null>(null)

  const clearResendTimer = useCallback(() => {
    if (resendTimer.current !== null) clearInterval(resendTimer.current)
    resendTimer.current = null
  }, [])

  useEffect(() => clearResendTimer, [clearResendTimer])

  const startResendCountdown = useCallback(() => {
    clearResendTimer()
    const expiresAt = Date.now() + 60_000
    setResendCountdown(60)
    resendTimer.current = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setResendCountdown(seconds)
      if (!seconds) clearResendTimer()
    }, 1000)
  }, [clearResendTimer])

  const resetCodeDigits = useCallback(() => {
    submittedCode.current = null
    setCodeDigits(createVerificationCodeDigits())
  }, [])

  function onCodeChange(value: string) {
    const code = normalizeVerificationCodeInput(value).slice(0, VERIFICATION_CODE_LENGTH)
    setCodeDigits(Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => code[index] ?? ''))
    if (code.length !== VERIFICATION_CODE_LENGTH) {
      submittedCode.current = null
    } else if (submittedCode.current !== code) {
      submittedCode.current = code
      onCompleteCode?.(code)
    }
  }

  return { codeDigits, setCodeDigits, canResend: resendCountdown === 0, resendCountdown,
    startResendCountdown, resetCodeDigits, onCodeChange }
}
