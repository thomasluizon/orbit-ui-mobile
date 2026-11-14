'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { isKeyboardViewportOpen } from '@/hooks/use-keyboard-viewport'
import { mediaQueryMatches } from '@/lib/media-query'

/**
 * Brings a field, its check and its main action above an on-screen keyboard together, as the mobile
 * group does. The browser reveals only the focused field, so while an element in the group has focus
 * and the keyboard is open, the group scrolls itself into view when the visual viewport resizes, when
 * an element in it takes focus, and when it changes size, which includes its first layout.
 */
export function KeyboardRevealGroup({ children, className, testID }: Readonly<{
  children: ReactNode
  className?: string
  testID?: string
}>) {
  const groupRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const group = groupRef.current
    const viewport = globalThis.visualViewport
    if (!group || !viewport) return
    let frame = 0
    const reveal = () => {
      cancelAnimationFrame(frame)
      // WHY: the resize steps run before the animation frame callbacks, so a shell that fits its scroller to the visual viewport in its own resize listener has done so when the group scrolls. https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering
      frame = requestAnimationFrame(() => {
        if (!isKeyboardViewportOpen(viewport) || !group.contains(document.activeElement)) return
        group.scrollIntoView({ block: 'nearest', behavior: mediaQueryMatches('(prefers-reduced-motion: reduce)', true) ? 'auto' : 'smooth' })
      })
    }
    const observer = new ResizeObserver(reveal)
    observer.observe(group)
    viewport.addEventListener('resize', reveal)
    group.addEventListener('focusin', reveal)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      viewport.removeEventListener('resize', reveal)
      group.removeEventListener('focusin', reveal)
    }
  }, [])
  return <div ref={groupRef} data-keyboard-reveal-group="" data-testid={testID} className={className}>{children}</div>
}
