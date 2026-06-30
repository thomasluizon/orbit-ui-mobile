'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'

const SHOW_THRESHOLD = 600

/**
 * Floating control that scrolls the window back to the top. Appears only after the
 * page is scrolled past {@link SHOW_THRESHOLD}, so it stays hidden on short lists and
 * surfaces once a long habit list has been scrolled. Sits bottom-right at every width:
 * above the phone bottom-nav below md, clear of the docked Astra launcher on desktop.
 * Hidden while Astra is expanded or multi-select is active to avoid colliding with
 * those bottom-anchored surfaces.
 */
export function BackToTop() {
  const t = useTranslations('common')
  const astraOpen = useShellStore((state) => state.astraOpen)
  const isSelectMode = useUIStore((state) => state.isSelectMode)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > SHOW_THRESHOLD)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const visible = scrolled && !astraOpen && !isSelectMode

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={t('backToTop')}
      title={t('backToTop')}
      data-testid="back-to-top"
      data-visible={visible}
      inert={!visible}
      className={[
        'fixed right-4 z-40 inline-flex items-center justify-center md:right-6',
        'transition-[opacity,transform] duration-[var(--dur-base)] ease-[var(--ease-standard)]',
        'hover:scale-105 active:scale-95',
        visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      ].join(' ')}
      style={{
        bottom: 'calc(var(--safe-bottom) + 88px)',
        width: 48,
        height: 48,
        borderRadius: 999,
        background: 'var(--bg-elev-2)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-2), inset 0 0 0 1px var(--hairline-strong)',
      }}
    >
      <ArrowUp size={20} strokeWidth={2.2} color="var(--fg-1)" aria-hidden />
    </button>
  )
}
