import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ListRow } from '@/components/ui/list-row'
import { measureProfileRow } from '../../support/profile-row-geometry'
import { __resetTestHostConfig, __setWindowDimensions } from '../../../test-mocks/react-native'

afterEach(__resetTestHostConfig)

describe('label switch row geometry', () => {
  for (const title of [ptBR.profile.proactiveAstra.title, ptBR.profile.aiSummary.title]) {
    it.each([1, 2])(`aligns ${title} at font scale %s`, async (fontScale) => {
      __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale })
      let tree!: ReactTestRenderer & { toJSON: () => Parameters<typeof measureProfileRow>[0] }
      await act(() => { tree = create(<ListRow title={title} compact textMode="label" toggle={{ checked: true, onChange: () => {} }} />) as typeof tree })
      try {
        const geometry = measureProfileRow(tree.toJSON(), 288, fontScale)
        const label = geometry.texts.find((text) => text.label === title)!
        const control = geometry.controls.find((control) => control.accessibilityLabel === title)!
        expect(control.height).toBeGreaterThanOrEqual(48)
        expect(label.clipped).toBe(false)
        if (label.lines === 1) {
          expect(Math.abs(label.top + label.height / 2 - control.top - control.height / 2)).toBeLessThanOrEqual(1)
          if (fontScale === 1) expect(geometry.height).toBe(52)
          else expect(geometry.height).toBeGreaterThan(52)
        } else {
          expect(fontScale).toBe(2)
          expect(Math.abs(label.top + label.height / 2 - control.top - control.height / 2)).toBeLessThanOrEqual(1)
          expect(geometry.height).toBeGreaterThan(52)
        }
      } finally { await act(() => tree.update(<></>)) }
    })
  }
})
