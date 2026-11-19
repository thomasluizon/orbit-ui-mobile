'use client'

import type { ReactNode } from 'react'
import { ListBulkSettle, ListScope } from '@/components/motion/list-motion'
import { useFlag } from '@/hooks/use-flag'
import { useUIStore } from '@/stores/ui-store'

/** The list scope of Hoje. With the guided flows on, a bulk action of the selection tray changes its rows together with one settle of the group, never one motion for each row. */
export function BulkMotionScope({ scope, children }: Readonly<{ scope: string; children: ReactNode }>) {
  const guided = useFlag('orbit_guided_flows')
  const generation = useUIStore((state) => state.bulkMotionGeneration)
  const active = useUIStore((state) => state.bulkMotionActive)
  if (!guided) return <ListScope scope={scope}>{children}</ListScope>
  return <ListScope scope={scope} bulk={active}><ListBulkSettle generation={generation}>{children}</ListBulkSettle></ListScope>
}
