'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/stores/ui-store'
import { useShellScroller } from '@/components/shell/shell-scroller-context'

const SHOW_THRESHOLD = 600

const BACK_TO_TOP_STYLE = {
  bottom: 'calc(var(--safe-bottom) + 88px)',
  width: 48,
  height: 48,
  borderRadius: 999,
  background: 'var(--bg-elev-2)',
  // react-doctor-disable-next-line no-large-animated-blur -- intentional frosted-glass control per DESIGN.md; the blur is static (only opacity/transform transition) on a small 48px surface, so the GPU cost stays bounded https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  backdropFilter: 'blur(12px)',
  // react-doctor-disable-next-line no-large-animated-blur -- intentional frosted-glass control per DESIGN.md; the blur is static (only opacity/transform transition) on a small 48px surface, so the GPU cost stays bounded https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  WebkitBackdropFilter: 'blur(12px)',
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
    const handleScroll = () => setScrolled(scroller.scrollTop > SHOW_THRESHOLD)
    handleScroll()
    scroller.addEventListener('scroll', handleScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', handleScroll)
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
        'fixed right-4 z-40 inline-flex items-center justify-center md:right-6',
        'transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-standard)]',
        'hover:scale-105 active:scale-[0.96]',
        visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      ].join(' ')}
      style={BACK_TO_TOP_STYLE}
    >
      <ArrowUp size={20} strokeWidth={2.2} color="var(--fg-1)" aria-hidden />
    </button>
  )
}
