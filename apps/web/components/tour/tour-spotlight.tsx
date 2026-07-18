'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { type TourTargetRect } from '@orbit/shared/stores'

interface TourSpotlightProps {
  targetRect: TourTargetRect | null
  padding?: number
}

const BORDER_RADIUS = 12
const GEOMETRY_TRANSITION =
  'x 280ms var(--ease-standard), y 280ms var(--ease-standard), width 280ms var(--ease-standard), height 280ms var(--ease-standard)'

export function TourSpotlight({ targetRect, padding = 8 }: Readonly<TourSpotlightProps>) {
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [lastTargetRect, setLastTargetRect] = useState(targetRect)

  if (targetRect && targetRect !== lastTargetRect) {
    setLastTargetRect(targetRect)
  }

  const rect = targetRect ?? lastTargetRect

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  if (viewport.w === 0) return null

  const cutout = rect
    ? {
        x: rect.x - padding,
        y: rect.y - padding,
        width: Math.max(rect.width + padding * 2, 0),
        height: Math.max(rect.height + padding * 2, 0),
      }
    : null

  return createPortal(
    <div
      className="fixed inset-0 z-tour-spotlight pointer-events-auto"
      aria-hidden="true"
    >
      <svg
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        className="absolute inset-0"
      >
        {cutout ? (
          <>
            <defs>
              <mask id="tour-spotlight-mask">
                <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
                <rect
                  x={cutout.x}
                  y={cutout.y}
                  width={cutout.width}
                  height={cutout.height}
                  rx={BORDER_RADIUS}
                  ry={BORDER_RADIUS}
                  fill="black"
                  style={{ transition: GEOMETRY_TRANSITION }}
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width={viewport.w}
              height={viewport.h}
              fill="rgba(0, 0, 0, 0.55)"
              mask="url(#tour-spotlight-mask)"
            />
            <rect
              x={cutout.x}
              y={cutout.y}
              width={cutout.width}
              height={cutout.height}
              rx={BORDER_RADIUS}
              ry={BORDER_RADIUS}
              fill="none"
              stroke="rgba(var(--primary-rgb), 0.7)"
              strokeWidth={1.5}
              style={{ transition: GEOMETRY_TRANSITION }}
            />
          </>
        ) : (
          <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="rgba(0, 0, 0, 0.55)" />
        )}
      </svg>
    </div>,
    // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- reached only after viewport is measured in a post-mount effect; the `viewport.w === 0` gate returns null on the server and first client render; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    document.body,
  )
}
