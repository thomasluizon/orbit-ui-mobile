'use client'

import { useMemo, useRef } from 'react'
import { toBlob } from 'html-to-image'
import { ACHIEVEMENT_EVENT_KEYS } from '@orbit/shared/types/gamification'
import { SHARE_CARD_FILE_NAME } from '@orbit/shared/utils'
import { useReportEvent } from '@/hooks/use-gamification'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'

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

/** Captures a ShareCard node to PNG and shares it via the Web Share API (files), falling back to a file download. */
export function useShareCard() {
  const captureRef = useRef<HTMLDivElement>(null)
  const [isSharing, setIsSharing] = useAccountScopedState(false)
  const [hasError, setHasError] = useAccountScopedState(false)
  const [savedFileName, setSavedFileName] = useAccountScopedState<string | null>(null)
  const { mutate: reportEvent } = useReportEvent()

  const canShareFiles = useMemo(() => {
    if (
      typeof navigator === 'undefined'
      || typeof navigator.share !== 'function'
      || typeof navigator.canShare !== 'function'
    ) {
      return false
    }
    const probe = new File([], SHARE_CARD_FILE_NAME, { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  }, [])

  async function captureFile(): Promise<File> {
    const node = captureRef.current
    if (!node) {
      throw new Error('Share card is not mounted')
    }
    const blob = await toBlob(node, { pixelRatio: 3, cacheBust: true })
    if (!blob) {
      throw new Error('Share card capture produced no image')
    }
    return new File([blob], SHARE_CARD_FILE_NAME, { type: 'image/png' })
  }

  async function share(payload: ShareCardPayload) {
    const accountGeneration = getAccountGeneration()
    setIsSharing(true)
    setHasError(false)
    setSavedFileName(null)
    try {
      const file = await captureFile()
      if (getAccountGeneration() !== accountGeneration) return
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: payload.shareTitle,
          text: payload.shareText,
          url: payload.url,
        })
        if (getAccountGeneration() !== accountGeneration) return
      } else {
        downloadFile(file)
        setSavedFileName(file.name)
      }
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch (error) {
      if (getAccountGeneration() !== accountGeneration) return
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setHasError(true)
    } finally {
      if (getAccountGeneration() === accountGeneration) setIsSharing(false)
    }
  }

  async function download() {
    const accountGeneration = getAccountGeneration()
    setIsSharing(true)
    setHasError(false)
    setSavedFileName(null)
    try {
      const file = await captureFile()
      if (getAccountGeneration() !== accountGeneration) return
      downloadFile(file)
      setSavedFileName(file.name)
      reportEvent(ACHIEVEMENT_EVENT_KEYS.cardShared)
    } catch {
      if (getAccountGeneration() === accountGeneration) setHasError(true)
    } finally {
      if (getAccountGeneration() === accountGeneration) setIsSharing(false)
    }
  }

  return { captureRef, isSharing, hasError, savedFileName, canShareFiles, share, download }
}
