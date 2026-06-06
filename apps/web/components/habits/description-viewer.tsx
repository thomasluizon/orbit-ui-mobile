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
      {}
      <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-[var(--hairline)] shrink-0">
        <button
          aria-label={t('common.back')}
          className="size-9 rounded-full bg-[var(--bg-elev)] flex items-center justify-center text-[var(--fg-2)] hover:text-[var(--fg-1)] transition-colors duration-150"
          onClick={() => onOpenChange(false)}
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="font-bold text-lg text-[var(--fg-1)] truncate">{title}</h1>
      </div>

      {}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Markdown content={description} />
      </div>
    </div>,
    document.body,
  )
}
