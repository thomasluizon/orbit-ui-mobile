'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SMALL_PILL_VISIBLE_MIN } from '@orbit/shared/theme'
import { Copy } from './icons'
import { Button } from './pill-button'

export function BlockCopyControl({ text }: Readonly<{ text: string }>) {
  const t = useTranslations('chat.blockCopy')
  const [feedback, setFeedback] = useState<{ status: 'idle' | 'copied' | 'error' }>({ status: 'idle' })
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const { status } = feedback
  useEffect(() => {
    if (feedback.status !== 'copied' || focused || hovered) return
    const resetTimer = setTimeout(() => setFeedback({ status: 'idle' }), 5000)
    return () => clearTimeout(resetTimer)
  }, [feedback, focused, hovered])

  async function copyBlock() {
    setFeedback({ status: 'idle' })
    try {
      await navigator.clipboard.writeText(text)
      setFeedback({ status: 'copied' })
    } catch {
      setFeedback({ status: 'error' })
    }
  }

  return <>
    <Button variant="ghost" size="sm" minimumHeight={SMALL_PILL_VISIBLE_MIN} leadingIcon={<Copy size={16} aria-hidden="true" />} onClick={() => void copyBlock()} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {t(status === 'copied' ? 'copied' : 'copy')}
    </Button>
    <span role="status" aria-live="polite" className={status === 'error' ? 'markdown-copy-error' : 'sr-only'}>
      {status === 'idle' ? '' : t(status === 'error' ? 'copyError' : 'copied')}
    </span>
  </>
}
