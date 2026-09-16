import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve('app/(app)/progress/_components/progress-content.tsx'), 'utf8')

describe('goal card interaction feedback', () => {
  it('keeps hover and press feedback responsive without entrance motion', () => {
    expect(source).toContain('background-color 380ms var(--ease-standard)')
    expect(source).toContain('box-shadow 380ms var(--ease-standard)')
    expect(source).toContain('scale 150ms var(--ease-out)')
    expect(source).not.toContain('transform 150ms var(--ease-out)')
    expect(source).toContain('hover:shadow-[inset_0_0_0_1px_var(--hairline-strong)]')
    expect(source).toContain('active:scale-[0.96]')
    expect(source).not.toContain('animate-')
  })

  it('keeps the exact dragged card lifted until release', () => {
    expect(source).toContain('transform: CSS.Transform.toString(transform)')
    expect(source).toContain('data-[dragging=true]:scale-[0.96]')
    expect(source).not.toContain('scale(0.96)')
    expect(source).toContain('data-[dragging=true]:opacity-50')
    expect(source).toContain('data-[dragging=true]:z-[2]')
    expect(source).toContain('data-[dragging=true]:shadow-[var(--sh-2),inset_0_0_0_1px_var(--hairline-strong)]')
  })
})
