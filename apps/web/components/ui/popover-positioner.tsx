'use client'

import type { ReactNode, RefObject } from 'react'
import { Popover } from '@base-ui/react/popover'

const POPOVER_EDGE_GAP = 8

interface PopoverPositionerProps {
  align: 'start' | 'end'
  anchorRef?: RefObject<unknown>
  children: ReactNode
}

/** Collision-aware positioning shared by anchored overlay callers. */
export function PopoverPositioner({
  align,
  anchorRef,
  children,
}: Readonly<PopoverPositionerProps>) {
  return (
    <Popover.Positioner
      align={align}
      anchor={() => anchorRef?.current instanceof Element ? anchorRef.current : null}
      className="orbit-popover-positioner"
      collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'none' }}
      collisionPadding={POPOVER_EDGE_GAP}
      positionMethod="fixed"
      side="bottom"
      sideOffset={POPOVER_EDGE_GAP}
    >
      {children}
    </Popover.Positioner>
  )
}
