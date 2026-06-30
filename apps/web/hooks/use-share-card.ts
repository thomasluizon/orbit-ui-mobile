'use client'

import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { reportCardShared } from '@/lib/report-card-shared'

interface ShareCardPayload {
  shareTitle: string
  shareText: string
  url: string
}

/** Captures a ShareCard node to PNG and shares it via the Web Share API (files), falling back to a file download. */
export function useShareCard() {
  const captureRef = useRef<HTMLDivElement>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [hasError, setHasError] = useState(false)

  const canShareFiles = useMemo(
    () => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function',
    [],
  )

  async function captureFile(): Promise<File> {
    const node = captureRef.current
    if (!node) {
      throw new Error('Share card is not mounted')
    }
    const dataUrl = await toPng(node, { pixelRatio: 3, cacheBust: true })
    const blob = await (await fetch(dataUrl)).blob()
    return new File([blob], 'orbit-recap.png', { type: 'image/png' })
  }

  function downloadFile(file: File) {
    const href = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = file.name
    anchor.click()
    URL.revokeObjectURL(href)
  }

  async function share(payload: ShareCardPayload) {
    setIsSharing(true)
    setHasError(false)
    try {
      const file = await captureFile()
      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: payload.shareTitle,
          text: payload.shareText,
          url: payload.url,
        })
      } else {
        downloadFile(file)
      }
      reportCardShared()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  async function download() {
    setIsSharing(true)
    setHasError(false)
    try {
      downloadFile(await captureFile())
      reportCardShared()
    } catch {
      setHasError(true)
    } finally {
      setIsSharing(false)
    }
  }

  return { captureRef, isSharing, hasError, canShareFiles, share, download }
}
