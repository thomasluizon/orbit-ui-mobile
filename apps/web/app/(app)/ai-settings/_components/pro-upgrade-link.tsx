'use client'

import Link from 'next/link'
import { Lock } from '@/components/ui/icons'

export function ProUpgradeLink({ label }: Readonly<{ label: string }>) {
  return (
    <Link href="/upgrade" className="chip">
      <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </Link>
  )
}
