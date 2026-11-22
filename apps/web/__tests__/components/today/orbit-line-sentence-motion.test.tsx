import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TodayOrbitLine } from '@/components/today/today-orbit-line'

const stylesheet = readFileSync(resolve('app/globals.css'), 'utf8')

describe('web Orbit line sentence change', () => {
  afterEach(cleanup)

  it('plays a keyframe that the stylesheet defines when the sentence changes', () => {
    const { container, rerender } = render(<TodayOrbitLine text="First sentence" destination="Abrir conversa" />)
    rerender(<TodayOrbitLine text="Second sentence" destination="Abrir conversa" />)
    const changed = container.querySelector<HTMLElement>('[data-sentence-change]')!
    const animationName = changed.style.animation.split(' ')[0]!
    expect(animationName).toBe('today-orbit-sentence-in')
    expect(stylesheet).toContain(`@keyframes ${animationName} {`)
  })
})
