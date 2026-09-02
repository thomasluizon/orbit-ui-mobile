'use client'

import type { KeyboardEventHandler, ReactNode, RefObject } from 'react'
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

interface AnchoredPopoverProps extends PopoverPositionerProps {
  panelRef: RefObject<HTMLDivElement | null>
  title?: string
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
}

/** Loads the collision library only while an anchored menu is open. */
export function AnchoredPopover({
  align,
  anchorRef,
  children,
  panelRef,
  title,
  onKeyDown,
}: Readonly<AnchoredPopoverProps>) {
  return (
    <Popover.Root open modal={false}>
      <Popover.Portal>
        <div className="orbit-menu-catcher" aria-hidden="true" />
        <PopoverPositioner align={align} anchorRef={anchorRef}>
          <Popover.Popup
            ref={panelRef}
            role="menu"
            aria-label={title}
            className="orbit-menu-panel"
            data-positioned=""
            initialFocus
            finalFocus={false}
            onKeyDown={onKeyDown}
          >
            {children}
          </Popover.Popup>
        </PopoverPositioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
