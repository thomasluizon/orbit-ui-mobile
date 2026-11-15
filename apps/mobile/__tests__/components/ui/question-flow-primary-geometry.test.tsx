import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))

const HEIGHT = 915
/** The layout support measures every text as 100 wide, so a pill that hugs its label is 100 plus its two paddings. */
const TEXT_WIDTH = 100
let tree: GeometryTree | null = null
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = null })

async function measure(width: number) {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => {
    tree = create(
      <View style={{ width, height: HEIGHT }}>
        <QuestionFlow flow="habit_create" stepKey="when" direction={1} question="Quando?" line="Pode ser qualquer dia." position={2} total={4}
          progressLabel="Passo 2 de 4" backLabel="Voltar" closeLabel="Fechar" onBack={() => {}} onClose={() => {}}
          options={<><OptionCard label="Hoje" onSelect={() => {}} /><OptionCard label="Amanhã" onSelect={() => {}} /></>}
          primary={{ label: 'Continuar', onPress: () => {} }} />
      </View>,
    ) as GeometryTree
  })
  const boxes = measureSafeArea(tree!.toJSON(), (host) => {
    if (host.props.testID === 'question-flow-step-when') return 'block'
    return typeof host.props.testID === 'string' && host.props.testID.startsWith('button-primary') ? 'primary' : undefined
  }, { width, height: HEIGHT })
  return { block: boxes.get('block')!, primary: boxes.get('primary')! }
}

describe('the primary action of the question flow on Android', () => {
  it.each([320, 360, 384, 412])('takes the full width inside the gutters in the compact shell at %i px', async (width) => {
    const { primary } = await measure(width)
    expect(primary.width).toBe(width - 32)
  })

  it('hugs its label at 1024 and above, at most 360 wide, in the centre under the block', async () => {
    const { block, primary } = await measure(1352)
    expect(primary.width).toBeLessThanOrEqual(360)
    expect(primary.width).toBeLessThan(TEXT_WIDTH * 2)
    expect(primary.width).toBeGreaterThan(TEXT_WIDTH)
    expect(Math.abs(primary.left + primary.width / 2 - (block.left + block.width / 2))).toBeLessThanOrEqual(1)
  })
})
