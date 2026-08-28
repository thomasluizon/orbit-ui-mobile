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
  readonly children: ReactNode
}
