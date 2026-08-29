'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'
import { useShellScroller } from '@/components/shell/shell-scroller-context'

const SHOW_THRESHOLD = 600

const BACK_TO_TOP_STYLE = {
  bottom: 'calc(var(--safe-bottom) + 96px)',
  width: 48,
  height: 48,
  borderRadius: 999,
  background: 'var(--bg-elev-2)',
  boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline-strong)',
} as const

function scrollToTop(scroller: HTMLElement | null) {
  if (!scroller) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
}

/**
 * Floating control that scrolls the shell back to the top. Appears only after the
 * page is scrolled past {@link SHOW_THRESHOLD}, so it stays hidden on short lists and
 * surfaces once a long habit list has been scrolled. Sits bottom-right at every width:
 * above the phone bottom-nav below md, clear of the docked Astra launcher on desktop.
 * Hidden while Astra is expanded or multi-select is active to avoid colliding with
 * those bottom-anchored surfaces.
 */
export function BackToTop() {
  const t = useTranslations('common')
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const [scrolled, setScrolled] = useState(false)
  const scroller = useShellScroller()

  useEffect(() => {
    if (!scroller) return
    const origin = scroller.querySelector('[data-shell-scroll-origin]')
    if (!origin) return

    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry?.isIntersecting),
      {
        root: scroller,
        rootMargin: `${SHOW_THRESHOLD}px 0px 0px`,
        threshold: 0,
      },
    )
    observer.observe(origin)
    return () => observer.disconnect()
  }, [scroller])

  const visible = scrolled && !isSelectMode

  return (
    <button
      type="button"
      onClick={() => scrollToTop(scroller)}
      aria-label={t('backToTop')}
      title={t('backToTop')}
      data-testid="back-to-top"
      data-visible={visible}
      inert={!visible}
      className={[
        'z-sticky fixed right-4 inline-flex items-center justify-center md:right-6',
        'transition-[background-color,opacity,transform] duration-[var(--dur-2)] ease-[var(--ease-standard)]',
        'hover:bg-[var(--bg-hover)] active:scale-[0.96]',
        visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      ].join(' ')}
      style={BACK_TO_TOP_STYLE}
    >
      <ArrowUp size={20} strokeWidth={2.2} color="var(--fg-1)" aria-hidden />
    </button>
  )
}
