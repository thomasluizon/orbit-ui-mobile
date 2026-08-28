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
   * The proposed value subtree. On native, uncolored Text and TextInput descendants take fg3 when
   * they are direct children or are nested through fragments, arrays, View, or Pressable. A
   * composite child owns the colors it sets. Every design-system component sets explicit token
   * colors, so it renders inside Proposed exactly as it renders outside. On web, CSS inheritance
   * gives uncolored descendants --fg-3 and produces the same visible result for the same children.
   * An explicit color always wins on both platforms.
   */
  readonly children: ReactNode
}
