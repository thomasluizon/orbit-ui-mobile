import type { ReactNode } from 'react'

export type ProposedScope = 'field' | 'row' | 'block'

export const PROPOSED_RADIUS = {
  field: 12,
  row: 8,
  block: 20,
} as const satisfies Record<ProposedScope, number>

export type ProposedProps = {
  readonly proposed: boolean
  readonly scope: ProposedScope
  readonly label: string
  /**
   * The proposed value subtree follows four tint rules on both platforms. 1. Container
   * elements recurse through fragments, arrays, and their children without taking an
   * inheritable color themselves. 3.
   */
  readonly children: ReactNode
}
