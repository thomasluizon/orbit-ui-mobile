import type { ReactNode } from 'react'

/** Shared-panel list container. Not for habits: every top-level habit owns its panel. */
export interface RowListProps {
  children?: ReactNode
  style?: unknown
}
