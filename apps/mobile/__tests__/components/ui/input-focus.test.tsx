import React from 'react'
import { expect, it, vi } from 'vitest'
import { Input } from '@/components/ui/input'

const TestRenderer = require('react-test-renderer')

for (const multiline of [false, true]) {
  it(`keeps one focused ${multiline ? 'multiline' : 'single-line'} input ring`, async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(multiline
        ? <Input label="Name" value="" onChange={vi.fn()} multiline marks={[]} marksLabel="Marks" />
        : <Input label="Name" value="" onChange={vi.fn()} />)
      await Promise.resolve()
    })
    const input = tree!.root.findByType('TextInput')
    TestRenderer.act(() => input.props.onFocus())
    const control = tree!.root.findByProps({ testID: 'input-control' })
    const ring = control.props.style[1]
    expect(ring.borderWidth).toBe(2)
    expect(ring.outlineWidth ?? 0).toBe(0)
  })
}
