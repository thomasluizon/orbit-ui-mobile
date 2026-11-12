import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { ListRow } from '@/components/ui/list-row'

const motionOverride = vi.hoisted(() => ({ pressDuration: 151, enter: [0.11, 0.22, 0.33, 0.44] as const }))

vi.mock('@orbit/shared/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/theme')>()
  return {
    ...actual,
    motionDurations: { ...actual.motionDurations, press: motionOverride.pressDuration },
    motionEasings: { ...actual.motionEasings, enter: motionOverride.enter },
  }
})

describe('list row press timing', () => {
  it('takes the row press duration and curve from the shared motion tokens', async () => {
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<ListRow title="Frequency" onClick={vi.fn()} />) })
    const content = tree.root.findAll((node) => node.props['data-slot'] === 'list-row-content')[0]!
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({ transition: 'transform 151ms cubic-bezier(0.11,0.22,0.33,0.44)' })
    await act(() => tree.update(<></>))
  })
})
