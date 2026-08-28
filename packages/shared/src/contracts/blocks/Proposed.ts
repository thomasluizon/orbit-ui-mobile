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
   * The proposed value subtree follows four tint rules on both platforms.
   *
   * 1. A raw string or number is wrapped in a text element carrying fg3.
   * 2. An uncolored native or intrinsic text element takes fg3. Container elements recurse through
   *    fragments, arrays, and their children without taking an inheritable color themselves.
   * 3. An explicit element color wins and stops the walk at that element.
   * 4. A composite element is returned unchanged. Its uncolored output uses the host's ambient fg1,
   *    while any color owned by the composite remains intact.
   */
  readonly children: ReactNode
}
