'use client'

import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useIsClient } from '@/hooks/use-is-client'
import { Markdown } from '@/components/ui/markdown'

interface DescriptionViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
}

export function DescriptionViewer({
  open,
  onOpenChange,
  title,
  description,
}: Readonly<DescriptionViewerProps>) {
  const t = useTranslations()
  const mounted = useIsClient()

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-[var(--bg)] flex flex-col">
      <div
        className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b border-[var(--hairline)] shrink-0"
        style={{ minHeight: 56 }}
      >
        <button
          type="button"
          aria-label={t('common.back')}
          className="inline-flex shrink-0 items-center justify-center rounded-full appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-1)] transition-[background-color] duration-150 hover:bg-[var(--bg-elev)]"
          style={{ width: 44, height: 44 }}
          onClick={() => onOpenChange(false)}
        >
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1
          className="truncate text-[var(--fg-1)]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Markdown content={description} />
      </div>
    </div>,
    document.body,
  )
}
