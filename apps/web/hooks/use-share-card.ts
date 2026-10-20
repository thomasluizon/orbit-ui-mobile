'use client'

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { SHARE_CARD_FILE_NAME } from '@orbit/shared/utils'
import { useReportEvent } from '@/hooks/use-gamification'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import type { ShareCardQrHandle } from '@/components/share/share-card-qr'

const CAPTURE_DEADLINE_MS = 5000

interface ShareCardPayload {
  shareTitle: string
  shareText: string
  url: string
}

function downloadFile(file: File) {
  const href = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(href)
}

function supportsFileSharing() {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function'
    || typeof navigator.canShare !== 'function') return false
  const probe = new File([], SHARE_CARD_FILE_NAME, { type: 'image/png' })
  return navigator.canShare({ files: [probe] })
}

async function captureFile(node: HTMLDivElement | null, qrRef: RefObject<ShareCardQrHandle | null> | undefined,
  signal: AbortSignal, isCurrent: () => boolean) {
  if (!node) throw new Error('Share card is not mounted')
  if (qrRef && !qrRef.current) throw new Error('Share card QR is not mounted')
  const isReady = qrRef?.current ? await qrRef.current.prepareCapture(signal) : () => true
  if (!isCurrent() || !isReady()) throw new DOMException('Capture retired', 'AbortError')
  const { toBlob } = await import('html-to-image')
  if (!isCurrent() || !isReady()) throw new DOMException('Capture retired', 'AbortError')
  const blob = await toBlob(node, { pixelRatio: 3, cacheBust: true })
  if (!isCurrent() || !isReady()) throw new DOMException('Capture retired', 'AbortError')
  if (!blob) throw new Error('Share card capture produced no image')
  return { file: new File([blob], SHARE_CARD_FILE_NAME, { type: 'image/png' }), isReady }
}

/** Captures a ShareCard node to PNG and shares it via the Web Share API (files), falling back to a file download. */
export function useShareCard(qrRef?: RefObject<ShareCardQrHandle | null>) {
  const captureRef = useRef<HTMLDivElement>(null)
  const operationRef = useRef<AbortController | null>(null)
  const [isSharing, setIsSharing] = useAccountScopedState(false)
  const [hasError, setHasError] = useAccountScopedState(false)
  const [savedFileName, setSavedFileName] = useAccountScopedState<string | null>(null)
  const { mutate: reportEvent } = useReportEvent()

  useEffect(() => {
    const cancel = () => {
      operationRef.current?.abort()
      operationRef.current = null
    }
    const unsubscribe = subscribeToAccountGeneration(cancel)
    return () => { cancel(); unsubscribe() }
  }, [])

  const canShareFiles = useMemo(() => supportsFileSharing(), [])

  async function exportCard(payload?: ShareCardPayload) {
    if (operationRef.current) return
    const controller = new AbortController()
    operationRef.current = controller
    const accountGeneration = getAccountGeneration()
    const node = captureRef.current
    const isCurrent = () => !controller.signal.aborted
      && operationRef.current === controller && captureRef.current === node
      && getAccountGeneration() === accountGeneration
    let deadline: ReturnType<typeof setTimeout> | undefined
    let cancel = () => {}
    setIsSharing(true)
    setHasError(false)
    setSavedFileName(null)
    try {
      const interrupted = new Promise<never>((_, reject) => {
        cancel = () => reject(new DOMException('Capture cancelled', 'AbortError'))
        controller.signal.addEventListener('abort', cancel, { once: true })
        deadline = setTimeout(() => {
          reject(new Error('Share card readiness deadline exceeded'))
          controller.abort()
        }, CAPTURE_DEADLINE_MS)
      })
      const { file, isReady } = await Promise.race([captureFile(node, qrRef, controller.signal, isCurrent), interrupted])
      clearTimeout(deadline)
      if (!isCurrent() || !isReady()) return
      if (payload && canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: payload.shareTitle,
          text: payload.shareText,
          url: payload.url,
        })
        if (!isCurrent() || !isReady()) return
      } else {
        downloadFile(file)
        setSavedFileName(file.name)
      }
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch (error) {
      if (operationRef.current !== controller || getAccountGeneration() !== accountGeneration) return
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setHasError(true)
    } finally {
      clearTimeout(deadline)
      controller.signal.removeEventListener('abort', cancel)
      if (operationRef.current === controller) {
        operationRef.current = null
        setIsSharing(false)
      }
    }
  }

  function resetFeedback() {
    operationRef.current?.abort()
    operationRef.current = null
    setIsSharing(false)
    setHasError(false)
    setSavedFileName(null)
  }

  const reportCaptureError = useCallback(() => {
    setHasError(true)
    setSavedFileName(null)
  }, [setHasError, setSavedFileName])

  return {
    captureRef, isSharing, hasError, savedFileName, canShareFiles, resetFeedback, reportCaptureError,
    share: (payload: ShareCardPayload) => exportCard(payload), download: () => exportCard(),
  }
}
