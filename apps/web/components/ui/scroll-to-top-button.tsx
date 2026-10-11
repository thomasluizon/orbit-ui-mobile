'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMotionValueEvent, useScroll } from 'motion/react'
import { updateScrollToTopState } from '@orbit/shared/utils'
import { useShellScroller } from '@/components/shell/shell-scroller-context'
import { getShellHeading } from '@/components/shell/shell-header'
import { ArrowUp } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'

function ScrollerButton({ scroller }: Readonly<{ scroller: HTMLElement }>) {
  const t = useTranslations()
  const container = useMemo(() => ({ current: scroller }), [scroller])
  const { scrollY } = useScroll({ container })
  const scrollState = useRef({ offset: 0, visible: false })
  const [visible, setVisible] = useState(false)
  useMotionValueEvent(scrollY, 'change', (offset) => {
    const next = updateScrollToTopState(scrollState.current, offset, scroller.clientHeight)
    if (next.visible !== scrollState.current.visible) setVisible(next.visible)
    scrollState.current = next
  })
  if (!visible) return null
  return (
    <PillButton variant="ghost" quiet elevated minimumHeight={48} accessibleName={t('common.backToTop')}
      leadingIcon={<ArrowUp size={20} strokeWidth={2} aria-hidden="true" />} onClick={() => {
        scroller.scrollTo({ top: 0, behavior: 'instant' })
        const heading = getShellHeading(document)
        const target = heading ?? scroller
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
        target.focus({ preventScroll: true })
        scrollState.current = { offset: 0, visible: false }
        setVisible(false)
      }}>
      {t('common.top')}
    </PillButton>
  )
}

export function ScrollToTopButton() {
  const scroller = useShellScroller()
  return scroller ? <ScrollerButton scroller={scroller} /> : null
}
