'use client'

import { SPACING } from '@orbit/shared/theme'
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'

export interface ShareCardQrHandle {
  prepareCapture: (signal: AbortSignal) => Promise<() => boolean>
}

interface ShareCardQrProps {
  value: string
  size: number
  ref?: Ref<ShareCardQrHandle>
  onError?: () => void
}

/** Renders a QR of the recap deep-link as a background-image data-URL so html-to-image serializes it on capture. */
export function ShareCardQr(props: Readonly<ShareCardQrProps>) {
  const generation = useAccountGeneration()
  return <QrImage key={`${generation}:${props.size}:${props.value}`} {...props} />
}

function QrImage({ value, size, ref, onError }: Readonly<ShareCardQrProps>) {
  const imageRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<{
    controller: AbortController
    promise: Promise<() => boolean>
    failed: boolean
  } | null>(null)

  const start = useCallback(() => {
    const controller = new AbortController()
    const generation = getAccountGeneration()
    const isCurrent = (): boolean => !controller.signal.aborted && getAccountGeneration() === generation
      && requestRef.current === request && imageRef.current !== null
    const generate = async () => {
      const { default: QRCode } = await import('qrcode')
      if (!isCurrent()) throw new DOMException('QR retired', 'AbortError')
      const url = await QRCode.toDataURL(value, {
        margin: SPACING.s0, width: size * 4,
        color: { dark: '#020618', light: '#ffffff' },
      })
      if (!isCurrent()) throw new DOMException('QR retired', 'AbortError')
      imageRef.current!.style.backgroundImage = `url(${url})`
      return isCurrent
    }
    const request = { controller, promise: generate(), failed: false }
    requestRef.current = request
    void request.promise.catch(() => {
      request.failed = true
      if (isCurrent()) onError?.()
    })
    return request
  }, [value, size, onError])

  useImperativeHandle(ref, () => ({
    async prepareCapture(signal) {
      const request = !requestRef.current || requestRef.current.failed || requestRef.current.controller.signal.aborted
        ? start() : requestRef.current
      const cancel = () => request.controller.abort()
      if (signal.aborted) cancel()
      signal.addEventListener('abort', cancel, { once: true })
      try { return await request.promise }
      finally { signal.removeEventListener('abort', cancel) }
    },
  }), [start])

  useEffect(() => {
    start()
    return () => { requestRef.current?.controller.abort() }
  }, [start])

  return (
    <div
      ref={imageRef}
      role="img"
      aria-hidden="true"
      data-testid="share-card-qr"
      style={{
        width: size,
        height: size,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
