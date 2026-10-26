'use client'

import { Copy } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

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
    <IconButton label={t(status === 'copied' ? 'copied' : 'copy')} onClick={() => void copyBlock()} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}><Copy size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
    <span role="status" aria-live="polite" className={status === 'error' ? 'markdown-copy-error' : 'sr-only'}>
      {status === 'idle' ? '' : t(status === 'error' ? 'copyError' : 'copied')}
    </span>
  </>
}
