'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { shareQrColors } from '@orbit/shared/theme'

interface ShareCardQrProps {
  value: string
  size: number
}

/** Renders a QR of the recap deep-link as a background-image data-URL so html-to-image serializes it on capture. */
export function ShareCardQr({ value, size }: Readonly<ShareCardQrProps>) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, {
      margin: 0,
      width: size * 4,
      color: { dark: shareQrColors.dark, light: shareQrColors.light },
    })
      .then((url) => {
        if (active) setDataUrl(url)
      })
      .catch(() => {
        if (active) setDataUrl(null)
      })
    return () => {
      active = false
    }
  }, [value, size])

  return (
    <div
      role="img"
      aria-hidden="true"
      data-testid="share-card-qr"
      style={{
        width: size,
        height: size,
        backgroundImage: dataUrl ? `url(${dataUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
