'use client'

import { useEffect, useState } from 'react'
import { type TourTargetRect } from '@orbit/shared/stores'

interface TourSpotlightProps {
  targetRect: TourTargetRect
  padding?: number
}

const BORDER_RADIUS = 12

export function TourSpotlight({ targetRect, padding = 8 }: Readonly<TourSpotlightProps>) {
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  if (viewport.w === 0) return null

  const x = targetRect.x - padding
  const y = targetRect.y - padding
  const w = targetRect.width + padding * 2
  const h = targetRect.height + padding * 2

  return (
    <div
      className="fixed inset-0 z-[9998] pointer-events-auto"
      aria-hidden="true"
    >
      <svg
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        className="absolute inset-0"
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
            <rect
              x={x}
              y={y}
              width={Math.max(w, 0)}
              height={Math.max(h, 0)}
              rx={BORDER_RADIUS}
              ry={BORDER_RADIUS}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={viewport.w}
          height={viewport.h}
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>
    </div>
  )
}
