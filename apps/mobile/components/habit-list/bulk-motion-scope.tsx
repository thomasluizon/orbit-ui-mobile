import type { ReactNode } from 'react'
import { ListBulkSettle, ListScope } from '@/components/motion/list-scope'
import { useUIStore } from '@/stores/ui-store'

/** The list scope of Hoje. A bulk action of the selection tray changes its rows together with one settle of the group, never one motion for each row. */
export function BulkMotionScope({ scope, children }: Readonly<{ scope: string; children: ReactNode }>) {
  const generation = useUIStore((state) => state.bulkMotionGeneration)
  const active = useUIStore((state) => state.bulkMotionActive)
  
  return <ListScope scope={scope} bulk={active}><ListBulkSettle generation={generation}>{children}</ListBulkSettle></ListScope>
}
