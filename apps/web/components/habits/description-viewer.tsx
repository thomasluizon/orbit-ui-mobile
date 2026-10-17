'use client'

import { DescriptionCopyButton } from './description-copy-button'
import { Sheet } from '@/components/ui/sheet'
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
  return (
    open ? (<Sheet open onClose={() => onOpenChange(false)} title={title}>
      <DescriptionCopyButton key={description} description={description} />
      <div
        className="min-w-0 rounded-[18px] bg-[var(--bg-card)]"
        style={{
          padding: '16px',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <Markdown content={description} />
      </div>
    </Sheet>) : null
  )
}
