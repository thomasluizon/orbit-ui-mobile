import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import { TodayAstraLine } from '@/components/today/today-astra-line'

const stylesheet = readFileSync(resolve('app/globals.css'), 'utf8')

describe('web Orbit line sentence change', () => {
  afterEach(cleanup)

  it('plays a keyframe that the stylesheet defines when the sentence changes', () => {
    enableTestFlags('orbit_guided_flows')
    const { container, rerender } = render(<TodayAstraLine text="First sentence" destination="Abrir conversa" />)
    rerender(<TodayAstraLine text="Second sentence" destination="Abrir conversa" />)
    const changed = container.querySelector<HTMLElement>('[data-sentence-change]')!
    const animationName = changed.style.animation.split(' ')[0]!
    expect(animationName).toBe('today-orbit-sentence-in')
    expect(stylesheet).toContain(`@keyframes ${animationName} {`)
  })
})
