import { describe, expect, it } from 'vitest'
import { resolveCenteredOverlayFrame } from '@/components/ui/centered-overlay-frame'

describe('resolveCenteredOverlayFrame', () => {
  it('centers a capped overlay after a large screen rotates', () => {
    expect(resolveCenteredOverlayFrame(412, 380)).toEqual({ left: 16, width: 380 })
    expect(resolveCenteredOverlayFrame(1280, 380)).toEqual({ left: 450, width: 380 })
  })
})
