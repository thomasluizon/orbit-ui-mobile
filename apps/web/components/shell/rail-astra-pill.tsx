'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AstraMark } from '@/components/ui/astra-avatar'

/** Compact rail pill that opens Astra chat, carrying the orbital glyph as its identity. */
export function RailAstraPill() {
  const t = useTranslations()

  return (
    <Link
      href="/chat"
      aria-label={t('rail.askAstra')}
      className="flex min-h-[44px] w-full items-center justify-center rounded-full transition-[transform,background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.97]"
      style={{ gap: 8, paddingInline: 18, boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)' }}
    >
      <AstraMark size={18} />
      <span
        style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500, color: 'var(--fg-1)' }}
      >
        {t('rail.askAstra')}
      </span>
    </Link>
  )
}
