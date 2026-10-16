'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { Copy } from './icons'
import { Button } from './pill-button'

export function BlockCopyControl({ text }: Readonly<{ text: string }>) {
  const t = useTranslations('chat.blockCopy')
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(resetTimer.current), [])

  async function copyBlock() {
    clearTimeout(resetTimer.current)
    setStatus('idle')
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      resetTimer.current = setTimeout(() => setStatus('idle'), 5000)
    } catch {
      setStatus('error')
    }
  }

  return <>
    <Button variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} leadingIcon={<Copy size={16} aria-hidden="true" />} onClick={() => void copyBlock()}>
      {t(status === 'copied' ? 'copied' : 'copy')}
    </Button>
    <span role="status" aria-live="polite" className={status === 'error' ? 'markdown-copy-error' : 'sr-only'}>
      {status === 'idle' ? '' : t(status === 'error' ? 'copyError' : 'copied')}
    </span>
  </>
}
