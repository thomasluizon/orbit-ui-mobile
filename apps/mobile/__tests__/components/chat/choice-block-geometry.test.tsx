import React from 'react'
import { View } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { makeChoiceLayoutBlock, makePickListLayoutBlock } from '@orbit/shared/test-support/choice-layout-fixtures'
import { ChoiceBlock } from '@/components/chat/choice-block'
import { PickListBlock } from '@/components/chat/pick-list-block'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type Tree = ReturnType<typeof renderer.create> & { toJSON: () => Parameters<typeof measureProfileRow>[0]; unmount: () => void }
afterEach(async () => { __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }); await i18n.changeLanguage('en') })

it.each([320, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))('fits Android option copy and trails actions at $width in $locale', async ({ width, locale }) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  await i18n.changeLanguage(locale)
  let tree!: Tree
  await renderer.act(() => { tree = renderer.create(<View><ChoiceBlock block={makeChoiceLayoutBlock(locale, false)} /><ChoiceBlock block={makeChoiceLayoutBlock(locale, true)} /><PickListBlock block={makePickListLayoutBlock(locale)} /></View>) as Tree })
  try {
    const layout = measureProfileRow(tree.toJSON(), width - 32, 1)
    for (const option of makeChoiceLayoutBlock(locale, false).options) {
      const labels = layout.texts.filter(text => text.label === option.label)
      const descriptions = layout.texts.filter(text => text.label === option.description)
      expect(labels).toHaveLength(2)
      expect(descriptions).toHaveLength(4)
      for (const text of [...labels, ...descriptions]) { expect(text.lines).toBe(1); expect(text.clipped).toBe(false) }
    }
    const rows = layout.boxes.filter(box => box.testID === 'action-row')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      const action = layout.controls.find(control => control.labels.includes(locale === 'en' ? 'Send' : 'Enviar') && control.top >= row.top && control.bottom <= row.bottom)
        ?? layout.controls.find(control => control.labels.includes(locale === 'en' ? 'Review' : 'Revisar') && control.top >= row.top && control.bottom <= row.bottom)
      expect(action).toBeDefined()
      expect(action!.right).toBeCloseTo(row.right, 1)
    }
  } finally { await renderer.act(() => tree.unmount()) }
})
